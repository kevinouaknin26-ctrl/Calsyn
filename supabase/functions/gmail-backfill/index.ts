/**
 * gmail-backfill — Ingère TOUS les emails du compte (pagination complète).
 *
 * À appeler plusieurs fois jusqu'à ce que gmail_backfill_done_at soit set.
 * Time budget : 4 min par invocation. Reprise via pageToken stocké en DB.
 *
 * Auto-création de prospects depuis emails inconnus (liste "Mails").
 *
 * POST /gmail-backfill?user_id=<uuid> (admin)
 * POST /gmail-backfill (cron, all users)
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
const TIME_BUDGET_MS = 4 * 60 * 1000 // 4 min (edge fn limite 5min)
const PAGE_SIZE = 500
const PARALLEL_BATCH = 20 // fetch détail messages en parallèle

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
    .eq('user_id', userId).eq('provider', 'google_calendar').maybeSingle()
  if (!integration) return null
  const expiresAt = new Date(integration.token_expires_at).getTime()
  if (expiresAt > Date.now() + 60_000) return integration.access_token
  if (!integration.refresh_token) return null
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
      refresh_token: integration.refresh_token, grant_type: 'refresh_token',
    }),
  })
  const d = await r.json()
  if (!r.ok || !d.access_token) return null
  await admin.from('user_integrations').update({
    access_token: d.access_token,
    token_expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('provider', 'google_calendar')
  return d.access_token
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
  const m = addr.match(/<([^>]+)>/); return (m ? m[1] : addr).trim().toLowerCase()
}
function extractName(addr: string): string {
  const m = addr.match(/^\s*"?([^<"]+?)"?\s*<[^>]+>/)
  if (m) return m[1].trim()
  return extractEmail(addr).split('@')[0]
}

async function getOrCreateMailList(organisationId: string, ownerUserId: string): Promise<string | null> {
  const admin = getAdmin()
  const { data: existing } = await admin.from('prospect_lists')
    .select('id').eq('organisation_id', organisationId).eq('name', MAIL_LIST_NAME).is('deleted_at', null).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await admin.from('prospect_lists').insert({
    organisation_id: organisationId, name: MAIL_LIST_NAME, created_by: ownerUserId, assigned_to: [ownerUserId],
  }).select('id').single()
  if (error) { console.error('[gmail-backfill] create Mails list:', error); return null }
  return created.id
}

async function createProspectFromEmail(organisationId: string, mailListId: string, email: string, displayName: string): Promise<string | null> {
  const admin = getAdmin()
  const { data: byEmail } = await admin.from('prospects').select('id')
    .eq('organisation_id', organisationId).eq('email', email).is('deleted_at', null).maybeSingle()
  if (byEmail) return byEmail.id
  const { data: byEmail23 } = await admin.from('prospects').select('id')
    .eq('organisation_id', organisationId).or(`email2.eq.${email},email3.eq.${email}`).is('deleted_at', null).maybeSingle()
  if (byEmail23) return byEmail23.id
  if (displayName) {
    const norm = normalizeName(displayName)
    if (norm.length > 2 && norm.includes(' ')) {
      const { data: candidates } = await admin.from('prospects')
        .select('id, name, email, email2, email3')
        .eq('organisation_id', organisationId).is('deleted_at', null)
        .ilike('name', `%${displayName.split(' ')[0]}%`).limit(20)
      for (const c of candidates || []) {
        if (normalizeName(c.name as string) === norm) {
          const update: Record<string, string> = {}
          if (!c.email) update.email = email
          else if (c.email !== email && !c.email2) update.email2 = email
          else if (c.email !== email && c.email2 !== email && !c.email3) update.email3 = email
          if (Object.keys(update).length > 0) await admin.from('prospects').update(update).eq('id', c.id)
          await admin.from('prospect_list_memberships').insert({
            prospect_id: c.id, list_id: mailListId, organisation_id: organisationId,
          }).then(() => {}, () => {})
          return c.id as string
        }
      }
    }
  }
  const { data: created, error } = await admin.from('prospects').insert({
    organisation_id: organisationId, list_id: mailListId,
    name: displayName || email.split('@')[0], email, phone: null, crm_status: 'new',
  }).select('id').single()
  if (error) { console.error(`[gmail-backfill] create prospect ${email}:`, error); return null }
  await admin.from('prospect_list_memberships').insert({
    prospect_id: created.id, list_id: mailListId, organisation_id: organisationId,
  }).then(() => {}, () => {})
  return created.id
}

async function processMessage(
  userId: string, organisationId: string, messageId: string, accessToken: string,
  emailToProspect: Map<string, string>, myEmail: string,
  mailListIdGetter: () => Promise<string | null>,
): Promise<{ inserted: boolean; created: boolean }> {
  const admin = getAdmin()
  // Skip si déjà ingéré
  const { data: existing } = await admin.from('messages').select('id').eq('channel', 'email').eq('external_id', messageId).maybeSingle()
  if (existing) return { inserted: false, created: false }

  const fullRes = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, { headers: { 'Authorization': `Bearer ${accessToken}` } })
  if (!fullRes.ok) return { inserted: false, created: false }
  const msg = await fullRes.json()
  const labelIds = (msg.labelIds || []) as string[]
  const isUnread = labelIds.includes('UNREAD')

  const headers = msg.payload?.headers || []
  const from = getHeader(headers, 'From')
  const to = getHeader(headers, 'To')
  const subject = getHeader(headers, 'Subject')
  const dateHeader = getHeader(headers, 'Date')
  const fromEmail = extractEmail(from)
  const toEmails = to.split(',').map(extractEmail)

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
  let createdProspect = false
  if (!prospectId) {
    const isFromMe = myEmail && fromEmail === myEmail
    const candidateEmail = isFromMe ? toEmails.find(e => e && e !== myEmail) : fromEmail
    const candidateName = isFromMe ? '' : extractName(from)
    if (!candidateEmail) return { inserted: false, created: false }
    if (isAutomatedEmail(candidateEmail, headers)) return { inserted: false, created: false }
    const mailListId = await mailListIdGetter()
    if (!mailListId) return { inserted: false, created: false }
    const newProspectId = await createProspectFromEmail(organisationId, mailListId, candidateEmail, candidateName)
    if (!newProspectId) return { inserted: false, created: false }
    emailToProspect.set(candidateEmail, newProspectId)
    prospectId = newProspectId
    direction = isFromMe ? 'out' : 'in'
    createdProspect = true
  }

  const { text, html } = extractBody(msg.payload)
  const sentAt = msg.internalDate ? new Date(parseInt(msg.internalDate, 10)).toISOString() : (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString())
  const { error: insErr } = await admin.from('messages').insert({
    organisation_id: organisationId, prospect_id: prospectId, user_id: userId,
    channel: 'email', direction,
    external_id: messageId, external_thread_id: msg.threadId,
    from_address: fromEmail, to_address: toEmails.join(', '),
    subject: subject || null, body: text || null, body_html: html || null,
    sent_at: sentAt, status: direction === 'in' ? 'received' : 'sent',
    is_read: direction === 'out' ? true : !isUnread,
    metadata: { label_ids: labelIds, via: 'backfill' },
  })
  return { inserted: !insErr, created: createdProspect }
}

async function backfillUser(userId: string, organisationId: string, startedAt: number): Promise<{ pages: number; inserted: number; created_prospects: number; done: boolean; nextToken: string | null }> {
  const admin = getAdmin()
  const token = await getValidAccessToken(userId)
  if (!token) return { pages: 0, inserted: 0, created_prospects: 0, done: true, nextToken: null }

  // Charge prospects en mémoire pour matching
  const { data: prospects } = await admin
    .from('prospects').select('id, email, email2, email3')
    .eq('organisation_id', organisationId).is('deleted_at', null)
  const emailToProspect = new Map<string, string>()
  for (const p of prospects || []) for (const e of [p.email, p.email2, p.email3]) if (e) emailToProspect.set(e.trim().toLowerCase(), p.id)

  // Récup mon email
  const profileRes = await fetch(`${GMAIL_API}/profile`, { headers: { 'Authorization': `Bearer ${token}` } })
  const profileData = await profileRes.json().catch(() => ({}))
  const myEmail = (profileData.emailAddress || '').toLowerCase()

  // Token de reprise
  const { data: ig } = await admin.from('user_integrations')
    .select('gmail_backfill_token, gmail_backfill_done_at')
    .eq('user_id', userId).eq('provider', 'google_calendar').single()
  if (ig?.gmail_backfill_done_at) return { pages: 0, inserted: 0, created_prospects: 0, done: true, nextToken: null }
  let pageToken: string | null = ig?.gmail_backfill_token || null

  let mailListId: string | null = null
  const mailListGetter = async () => { if (!mailListId) mailListId = await getOrCreateMailList(organisationId, userId); return mailListId }

  let pages = 0, totalInserted = 0, totalCreated = 0
  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      // Sauvegarder le token pour reprendre plus tard
      await admin.from('user_integrations').update({ gmail_backfill_token: pageToken })
        .eq('user_id', userId).eq('provider', 'google_calendar')
      return { pages, inserted: totalInserted, created_prospects: totalCreated, done: false, nextToken: pageToken }
    }

    const url = new URL(`${GMAIL_API}/messages`)
    url.searchParams.set('maxResults', String(PAGE_SIZE))
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const listRes = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${token}` } })
    if (!listRes.ok) {
      console.error(`[gmail-backfill] List failed: ${listRes.status}`)
      break
    }
    const listData = await listRes.json() as { messages?: Array<{ id: string }>; nextPageToken?: string }
    const messages = listData.messages || []
    pageToken = listData.nextPageToken || null
    pages++

    // Process en parallèle par batch
    for (let i = 0; i < messages.length; i += PARALLEL_BATCH) {
      const batch = messages.slice(i, i + PARALLEL_BATCH)
      const results = await Promise.all(batch.map(m => processMessage(userId, organisationId, m.id, token, emailToProspect, myEmail, mailListGetter)))
      for (const r of results) { if (r.inserted) totalInserted++; if (r.created) totalCreated++ }
      if (Date.now() - startedAt > TIME_BUDGET_MS) break
    }

    if (!pageToken) {
      // Backfill terminé pour ce user
      await admin.from('user_integrations').update({
        gmail_backfill_token: null,
        gmail_backfill_done_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('provider', 'google_calendar')
      return { pages, inserted: totalInserted, created_prospects: totalCreated, done: true, nextToken: null }
    }
  }
  // Save token et sortie (boucle interrompue par erreur)
  await admin.from('user_integrations').update({ gmail_backfill_token: pageToken })
    .eq('user_id', userId).eq('provider', 'google_calendar')
  return { pages, inserted: totalInserted, created_prospects: totalCreated, done: false, nextToken: pageToken }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const startedAt = Date.now()
  const url = new URL(req.url)
  const targetUserId = url.searchParams.get('user_id') || undefined

  const admin = getAdmin()
  let igQuery = admin.from('user_integrations').select('user_id').eq('provider', 'google_calendar')
  if (targetUserId) igQuery = igQuery.eq('user_id', targetUserId)
  // Skip ceux déjà done si pas explicitement reset
  igQuery = igQuery.is('gmail_backfill_done_at', null)
  const { data: integrations } = await igQuery
  if (!integrations || integrations.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: 'No backfill pending' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const userIds = integrations.map((i: any) => i.user_id)
  const { data: profiles } = await admin.from('profiles').select('id, organisation_id').in('id', userIds)
  const orgByUser = new Map<string, string>()
  for (const p of (profiles || []) as any[]) if (p.organisation_id) orgByUser.set(p.id, p.organisation_id)

  const results = []
  for (const ig of integrations as any[]) {
    const orgId = orgByUser.get(ig.user_id)
    if (!orgId) continue
    try {
      const r = await backfillUser(ig.user_id, orgId, startedAt)
      results.push({ user_id: ig.user_id, ...r })
      if (Date.now() - startedAt > TIME_BUDGET_MS) break
    } catch (err) {
      results.push({ user_id: ig.user_id, error: (err as Error).message })
      captureError(err, { tags: { fn: 'gmail-backfill', stage: 'backfill_user' }, user: { id: ig.user_id } }).catch(() => {})
    }
  }
  return new Response(JSON.stringify({ ok: true, elapsed_ms: Date.now() - startedAt, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
