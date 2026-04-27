/**
 * gmail-ingest — Pulls les emails récents depuis Gmail vers la table messages.
 *
 * Triggered par pg_cron toutes les minutes (fallback sans Pub/Sub).
 *
 * Pour chaque user ayant connecté Google :
 *  1. Refresh le token si besoin
 *  2. Query Gmail messages newer_than:30d
 *  3. Pour chaque message :
 *     - Match prospect par email from/to
 *     - Si pas de match : auto-créer un prospect dans la liste "Mails"
 *     - INSERT message ou UPDATE is_read si déjà ingéré
 *
 * Idempotent grâce à UNIQUE(channel, external_id).
 *
 * Auth : service_role (cron) OU user JWT (refresh manuel).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { isAutomatedEmail, normalizeName } from '../_shared/email-filters.ts'
import { captureError } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const MAIL_LIST_NAME = 'Mails'

function getAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const admin = getAdmin()
  const { data: integration } = await admin
    .from('user_integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .maybeSingle()
  if (!integration) return null
  const expiresAt = new Date(integration.token_expires_at).getTime()
  if (expiresAt > Date.now() + 60_000) return integration.access_token
  if (!integration.refresh_token) return null
  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const refreshData = await refreshRes.json()
  if (!refreshRes.ok || !refreshData.access_token) return null
  await admin.from('user_integrations').update({
    access_token: refreshData.access_token,
    token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('provider', 'google_calendar')
  return refreshData.access_token
}

function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  try { return decodeURIComponent(escape(atob(b64))) } catch { return atob(b64) }
}

function extractBody(payload: any): { text: string; html: string } {
  let text = '', html = ''
  function walk(p: any) {
    if (!p) return
    if (p.mimeType === 'text/plain' && p.body?.data) text = text || decodeBase64Url(p.body.data)
    if (p.mimeType === 'text/html' && p.body?.data) html = html || decodeBase64Url(p.body.data)
    if (p.parts) for (const c of p.parts) walk(c)
  }
  walk(payload)
  return { text, html }
}

function getHeader(headers: any[], name: string): string {
  return (headers || []).find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function extractEmail(addr: string): string {
  const m = addr.match(/<([^>]+)>/)
  return (m ? m[1] : addr).trim().toLowerCase()
}

function extractName(addr: string): string {
  const m = addr.match(/^\s*"?([^<"]+?)"?\s*<[^>]+>/)
  if (m) return m[1].trim()
  return extractEmail(addr).split('@')[0]
}

async function getOrCreateMailList(organisationId: string, ownerUserId: string): Promise<string | null> {
  const admin = getAdmin()
  const { data: existing } = await admin
    .from('prospect_lists')
    .select('id').eq('organisation_id', organisationId).eq('name', MAIL_LIST_NAME)
    .is('deleted_at', null).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await admin.from('prospect_lists').insert({
    organisation_id: organisationId,
    name: MAIL_LIST_NAME,
    created_by: ownerUserId,
    assigned_to: [ownerUserId],
  }).select('id').single()
  if (error) { console.error('[gmail-ingest] create Mails list:', error); return null }
  return created.id
}

async function createProspectFromEmail(
  organisationId: string, mailListId: string, email: string, displayName: string
): Promise<string | null> {
  const admin = getAdmin()
  // 1. Match exact par email (déjà existe)
  const { data: byEmail } = await admin.from('prospects').select('id')
    .eq('organisation_id', organisationId).eq('email', email)
    .is('deleted_at', null).maybeSingle()
  if (byEmail) return byEmail.id
  // Aussi check email2/email3
  const { data: byEmail23 } = await admin.from('prospects').select('id')
    .eq('organisation_id', organisationId)
    .or(`email2.eq.${email},email3.eq.${email}`)
    .is('deleted_at', null).maybeSingle()
  if (byEmail23) return byEmail23.id

  // 2. Match par NOM normalisé → fusionne email dans email2/email3 du prospect existant
  if (displayName) {
    const norm = normalizeName(displayName)
    if (norm.length > 2 && norm.includes(' ')) { // au moins prénom + nom (évite faux match sur "Eric")
      const { data: candidates } = await admin.from('prospects')
        .select('id, name, email, email2, email3')
        .eq('organisation_id', organisationId).is('deleted_at', null)
        .ilike('name', `%${displayName.split(' ')[0]}%`)
        .limit(20)
      for (const c of candidates || []) {
        if (normalizeName(c.name as string) === norm) {
          // Match fort → ajoute l'email dans le 1er slot libre
          const update: Record<string, string> = {}
          if (!c.email) update.email = email
          else if (c.email !== email && !c.email2) update.email2 = email
          else if (c.email !== email && c.email2 !== email && !c.email3) update.email3 = email
          if (Object.keys(update).length > 0) {
            await admin.from('prospects').update(update).eq('id', c.id)
          }
          // Add membership Mails (utile pour visibilité)
          await admin.from('prospect_list_memberships').insert({
            prospect_id: c.id, list_id: mailListId, organisation_id: organisationId,
          }).then(() => {}, () => {})
          return c.id as string
        }
      }
    }
  }

  // 3. Création complète
  const { data: created, error } = await admin.from('prospects').insert({
    organisation_id: organisationId,
    list_id: mailListId,
    name: displayName || email.split('@')[0],
    email,
    phone: null,
    crm_status: 'new',
  }).select('id').single()
  if (error) { console.error(`[gmail-ingest] create prospect ${email}:`, error); return null }
  await admin.from('prospect_list_memberships').insert({
    prospect_id: created.id, list_id: mailListId, organisation_id: organisationId,
  }).then(() => {}, () => {})
  return created.id
}

async function ingestForUser(userId: string, organisationId: string): Promise<{ inserted: number; updated: number; created_prospects: number; checked: number }> {
  const token = await getValidAccessToken(userId)
  if (!token) return { inserted: 0, updated: 0, created_prospects: 0, checked: 0 }
  const admin = getAdmin()
  const { data: prospects } = await admin
    .from('prospects')
    .select('id, email, email2, email3')
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
  const emailToProspect = new Map<string, string>()
  for (const p of prospects || []) {
    for (const e of [p.email, p.email2, p.email3]) {
      if (e) emailToProspect.set(e.trim().toLowerCase(), p.id)
    }
  }

  const listRes = await fetch(`${GMAIL_API}/messages?q=newer_than:30d&maxResults=200`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!listRes.ok) return { inserted: 0, updated: 0, created_prospects: 0, checked: 0 }
  const listData = await listRes.json() as { messages?: Array<{ id: string }> }
  const messages = listData.messages || []
  if (messages.length === 0) return { inserted: 0, updated: 0, created_prospects: 0, checked: 0 }
  const externalIds = messages.map(m => m.id)

  const { data: existing } = await admin
    .from('messages').select('id, external_id, is_read')
    .eq('channel', 'email').in('external_id', externalIds)
  const existingMap = new Map<string, { id: string; is_read: boolean }>()
  for (const e of existing || []) existingMap.set(e.external_id as string, { id: e.id as string, is_read: e.is_read as boolean })

  // Récupère l'email du user pour distinguer in/out
  const profileRes = await fetch(`${GMAIL_API}/profile`, { headers: { 'Authorization': `Bearer ${token}` } })
  const profileData = await profileRes.json().catch(() => ({}))
  const myEmail = (profileData.emailAddress || '').toLowerCase()

  let mailListId: string | null = null
  let inserted = 0, updated = 0, createdProspects = 0

  // Filtre : ne traiter que les NOUVEAUX messages (pas déjà en DB).
  // Le list endpoint ramène jusqu'à 200 msgs des 30 derniers jours, mais 99%
  // sont déjà ingérés → fetch full inutile = quota Gmail saturé.
  // Pour les existants, on update is_read si besoin via fetch metadata seulement
  // dans une 2e passe limitée à 5 messages (suffit pour propager les "lu" récents).
  const newMessages = messages.filter(m => !existingMap.has(m.id))
  const recentExisting = messages.filter(m => existingMap.has(m.id)).slice(0, 5)

  for (const m of newMessages) {
    try {
      const fullRes = await fetch(`${GMAIL_API}/messages/${m.id}?format=full`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!fullRes.ok) continue
      const msg = await fullRes.json()
      const labelIds = (msg.labelIds || []) as string[]
      const isUnread = labelIds.includes('UNREAD')
      const newIsRead = !isUnread

      const headers = msg.payload?.headers || []
      const from = getHeader(headers, 'From')
      const to = getHeader(headers, 'To')
      const subject = getHeader(headers, 'Subject')
      const dateHeader = getHeader(headers, 'Date')
      const messageId = getHeader(headers, 'Message-ID')
      const fromEmail = extractEmail(from)
      const toEmails = to.split(',').map(extractEmail)

      // Skip TOTAL des mails automatisés (noreply, drive-shares, calendar-notification,
      // mailchimp, etc.) AVANT toute logique de matching prospect. Évite que des mails
      // Google Drive / Outlook auto-share s'accrochent par erreur à un prospect existant
      // (ex: chez Lamia Cherif si un ancien email noreply traînait dans email2/email3).
      if (isAutomatedEmail(fromEmail, headers)) continue

      let prospectId: string | null = null
      let direction: 'in' | 'out' = 'in'
      if (emailToProspect.has(fromEmail)) {
        prospectId = emailToProspect.get(fromEmail)!
        direction = 'in'
      } else {
        for (const te of toEmails) {
          if (emailToProspect.has(te)) {
            prospectId = emailToProspect.get(te)!
            direction = 'out'
            break
          }
        }
      }

      // Si pas de match : auto-créer un prospect dans la liste Mails
      if (!prospectId) {
        const isFromMe = myEmail && fromEmail === myEmail
        const candidateEmail = isFromMe ? toEmails.find(e => e && e !== myEmail) : fromEmail
        const candidateName = isFromMe ? '' : extractName(from)
        if (!candidateEmail) continue
        // Double safety : check aussi sur le candidate (vrai pour 'isFromMe' où candidate=toEmail)
        if (isAutomatedEmail(candidateEmail, headers)) continue
        if (!mailListId) mailListId = await getOrCreateMailList(organisationId, userId)
        if (!mailListId) continue
        const newProspectId = await createProspectFromEmail(organisationId, mailListId, candidateEmail, candidateName)
        if (!newProspectId) continue
        emailToProspect.set(candidateEmail, newProspectId)
        prospectId = newProspectId
        direction = isFromMe ? 'out' : 'in'
        createdProspects++
      }

      const { text, html } = extractBody(msg.payload)
      const sentAt = msg.internalDate
        ? new Date(parseInt(msg.internalDate, 10)).toISOString()
        : (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString())
      const { error: insErr } = await admin.from('messages').insert({
        organisation_id: organisationId,
        prospect_id: prospectId,
        user_id: userId,
        channel: 'email',
        direction,
        external_id: m.id,
        external_thread_id: msg.threadId,
        from_address: fromEmail,
        to_address: toEmails.join(', '),
        subject: subject || null,
        body: text || null,
        body_html: html || null,
        sent_at: sentAt,
        status: direction === 'in' ? 'received' : 'sent',
        is_read: direction === 'out' ? true : newIsRead,
        metadata: { gmail_message_id: messageId, label_ids: labelIds },
      })
      if (!insErr) inserted++
    } catch (err) {
      console.error(`[gmail-ingest] Error processing ${m.id}:`, err)
      captureError(err, { tags: { fn: 'gmail-ingest', stage: 'process_message' }, extra: { gmail_message_id: m.id } }).catch(() => {})
    }
  }

  // 2e passe : sync is_read pour les 5 plus récents existants (format=metadata, 1 quota unit chacun).
  // Permet au "lu" Gmail de se propager dans Calsyn sans flooder l'API.
  for (const m of recentExisting) {
    try {
      const ex = existingMap.get(m.id)
      if (!ex) continue
      const metaRes = await fetch(`${GMAIL_API}/messages/${m.id}?format=metadata&metadataHeaders=`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!metaRes.ok) continue
      const meta = await metaRes.json()
      const labelIds = (meta.labelIds || []) as string[]
      const isUnread = labelIds.includes('UNREAD')
      const newIsRead = !isUnread
      if (ex.is_read !== newIsRead) {
        await admin.from('messages')
          .update({ is_read: newIsRead, metadata: { label_ids: labelIds } })
          .eq('id', ex.id)
        updated++
      }
    } catch {
      // silencieux : sync is_read est best-effort
    }
  }

  return { inserted, updated, created_prospects: createdProspects, checked: messages.length }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  let targetUserId: string | undefined
  const isCron = !token || token === serviceRole
  if (!isCron) {
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user } } = await userClient.auth.getUser(token)
    if (!user) return new Response('Invalid JWT', { status: 401, headers: corsHeaders })
    targetUserId = user.id
  }
  const admin = getAdmin()
  let igQuery = admin
    .from('user_integrations').select('user_id').eq('provider', 'google_calendar')
  if (targetUserId) igQuery = igQuery.eq('user_id', targetUserId)
  const { data: integrations, error: igErr } = await igQuery
  if (igErr) return new Response(JSON.stringify({ ok: false, error: igErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (!integrations || integrations.length === 0) {
    return new Response(JSON.stringify({ ok: true, synced: 0, isCron, reason: 'no_integrations' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const userIds = integrations.map((i: any) => i.user_id)
  const { data: profiles } = await admin
    .from('profiles').select('id, organisation_id').in('id', userIds)
  const orgByUser = new Map<string, string>()
  for (const p of (profiles || []) as any[]) {
    if (p.organisation_id) orgByUser.set(p.id, p.organisation_id)
  }
  const results: any[] = []
  for (const ig of integrations as any[]) {
    const orgId = orgByUser.get(ig.user_id)
    if (!orgId) { results.push({ user_id: ig.user_id, skipped: 'no_org' }); continue }
    try {
      const r = await ingestForUser(ig.user_id, orgId)
      results.push({ user_id: ig.user_id, ...r })
    } catch (err) {
      results.push({ user_id: ig.user_id, error: (err as Error).message })
      captureError(err, { tags: { fn: 'gmail-ingest', stage: 'ingest_user' }, user: { id: ig.user_id } }).catch(() => {})
    }
  }
  return new Response(JSON.stringify({ ok: true, isCron, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
