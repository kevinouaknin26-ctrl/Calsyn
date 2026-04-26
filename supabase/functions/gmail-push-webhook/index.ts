/**
 * gmail-push-webhook — Reçoit les push notifications Pub/Sub Gmail.
 *
 * Pub/Sub envoie un POST avec un payload JSON :
 *   { message: { data: base64(JSON({ emailAddress, historyId })), ... }, subscription: ... }
 *
 * Decode → user via emailAddress → fetch via history.list depuis le dernier
 * historyId stocké → pour chaque change, sync messages (insert nouveau OU
 * update is_read si labels changés).
 *
 * Auto-création de prospects depuis emails inconnus (liste "Mails").
 *
 * Sécurité : ?secret=XYZ comparé à GMAIL_PUBSUB_SECRET env.
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
  const { data: existing } = await admin.from('prospect_lists')
    .select('id').eq('organisation_id', organisationId).eq('name', MAIL_LIST_NAME).is('deleted_at', null).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await admin.from('prospect_lists').insert({
    organisation_id: organisationId, name: MAIL_LIST_NAME, created_by: ownerUserId, assigned_to: [ownerUserId],
  }).select('id').single()
  if (error) { console.error('[gmail-push] create Mails list:', error); return null }
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
  if (error) { console.error(`[gmail-push] create prospect ${email}:`, error); return null }
  await admin.from('prospect_list_memberships').insert({
    prospect_id: created.id, list_id: mailListId, organisation_id: organisationId,
  }).then(() => {}, () => {})
  return created.id
}

async function syncMessage(
  userId: string, organisationId: string, messageId: string, accessToken: string,
  emailToProspect: Map<string, string>, myEmail: string,
  mailListIdGetter: () => Promise<string | null>
) {
  const admin = getAdmin()
  const fullRes = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, { headers: { 'Authorization': `Bearer ${accessToken}` } })
  if (!fullRes.ok) return
  const msg = await fullRes.json()
  const labelIds = (msg.labelIds || []) as string[]
  const isUnread = labelIds.includes('UNREAD')

  const { data: existing } = await admin.from('messages').select('id, is_read').eq('channel', 'email').eq('external_id', messageId).maybeSingle()
  if (existing) {
    if (existing.is_read === isUnread) {
      await admin.from('messages').update({ is_read: !isUnread, metadata: { label_ids: labelIds } }).eq('id', existing.id)
    }
    return
  }

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

  // Auto-création si pas de match
  if (!prospectId) {
    const isFromMe = myEmail && fromEmail === myEmail
    const candidateEmail = isFromMe ? toEmails.find(e => e && e !== myEmail) : fromEmail
    const candidateName = isFromMe ? '' : extractName(from)
    if (!candidateEmail) return
    if (isAutomatedEmail(candidateEmail, headers)) return
    const mailListId = await mailListIdGetter()
    if (!mailListId) return
    const newProspectId = await createProspectFromEmail(organisationId, mailListId, candidateEmail, candidateName)
    if (!newProspectId) return
    emailToProspect.set(candidateEmail, newProspectId)
    prospectId = newProspectId
    direction = isFromMe ? 'out' : 'in'
  }

  const { text, html } = extractBody(msg.payload)
  const sentAt = msg.internalDate ? new Date(parseInt(msg.internalDate, 10)).toISOString() : (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString())
  await admin.from('messages').insert({
    organisation_id: organisationId, prospect_id: prospectId, user_id: userId,
    channel: 'email', direction,
    external_id: messageId, external_thread_id: msg.threadId,
    from_address: fromEmail, to_address: toEmails.join(', '),
    subject: subject || null, body: text || null, body_html: html || null,
    sent_at: sentAt, status: direction === 'in' ? 'received' : 'sent',
    is_read: direction === 'out' ? true : !isUnread,
    metadata: { label_ids: labelIds, via: 'pubsub' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  const expectedSecret = Deno.env.get('GMAIL_PUBSUB_SECRET') || ''
  if (!expectedSecret || secret !== expectedSecret) return new Response('Forbidden', { status: 403, headers: corsHeaders })
  try {
    const body = await req.json() as { message?: { data?: string } }
    const dataB64 = body.message?.data
    if (!dataB64) return new Response('OK', { status: 204, headers: corsHeaders })
    const payload = JSON.parse(decodeBase64Url(dataB64)) as { emailAddress: string; historyId: string }
    const { emailAddress, historyId: newHistoryId } = payload
    const admin = getAdmin()
    const { data: profile } = await admin.from('profiles').select('id, organisation_id').eq('email', emailAddress).single()
    if (!profile) return new Response('OK', { headers: corsHeaders })
    const userId = profile.id
    const organisationId = profile.organisation_id
    if (!organisationId) return new Response('OK', { headers: corsHeaders })
    const accessToken = await getValidAccessToken(userId)
    if (!accessToken) return new Response('OK', { headers: corsHeaders })
    const { data: ig } = await admin.from('user_integrations').select('gmail_history_id').eq('user_id', userId).eq('provider', 'google_calendar').single()
    const startHistoryId = ig?.gmail_history_id ? String(ig.gmail_history_id) : newHistoryId
    const histRes = await fetch(`${GMAIL_API}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved`, { headers: { 'Authorization': `Bearer ${accessToken}` } })
    if (!histRes.ok) {
      console.error(`[gmail-push] history failed: ${histRes.status}`)
      await admin.from('user_integrations').update({ gmail_history_id: parseInt(newHistoryId, 10) }).eq('user_id', userId).eq('provider', 'google_calendar')
      return new Response('OK', { headers: corsHeaders })
    }
    const histData = await histRes.json() as { history?: any[] }
    const messageIds = new Set<string>()
    for (const h of histData.history || []) {
      for (const m of (h.messages || [])) messageIds.add(m.id)
      for (const ma of (h.messagesAdded || [])) if (ma.message?.id) messageIds.add(ma.message.id)
      for (const la of (h.labelsAdded || [])) if (la.message?.id) messageIds.add(la.message.id)
      for (const lr of (h.labelsRemoved || [])) if (lr.message?.id) messageIds.add(lr.message.id)
    }
    if (messageIds.size > 0) {
      const { data: prospects } = await admin.from('prospects').select('id, email, email2, email3').eq('organisation_id', organisationId).is('deleted_at', null)
      const emailToProspect = new Map<string, string>()
      for (const p of prospects || []) for (const e of [p.email, p.email2, p.email3]) if (e) emailToProspect.set(e.trim().toLowerCase(), p.id)
      const profileRes = await fetch(`${GMAIL_API}/profile`, { headers: { 'Authorization': `Bearer ${accessToken}` } })
      const profileData = await profileRes.json().catch(() => ({}))
      const myEmail = (profileData.emailAddress || '').toLowerCase()
      let mailListId: string | null = null
      const mailListGetter = async () => { if (!mailListId) mailListId = await getOrCreateMailList(organisationId, userId); return mailListId }
      for (const mid of messageIds) {
        try { await syncMessage(userId, organisationId, mid, accessToken, emailToProspect, myEmail, mailListGetter) }
        catch (err) { console.error(`[gmail-push] sync msg ${mid}:`, err) }
      }
    }
    await admin.from('user_integrations').update({ gmail_history_id: parseInt(newHistoryId, 10) }).eq('user_id', userId).eq('provider', 'google_calendar')
    return new Response('OK', { headers: corsHeaders })
  } catch (err) {
    console.error('[gmail-push-webhook] Error:', err)
    captureError(err, { tags: { fn: 'gmail-push-webhook' } }).catch(() => {})
    return new Response('OK', { headers: corsHeaders })
  }
})
