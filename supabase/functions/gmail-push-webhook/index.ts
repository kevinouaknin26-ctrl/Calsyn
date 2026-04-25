/**
 * gmail-push-webhook — Reçoit les push notifications Pub/Sub Gmail.
 *
 * Pub/Sub envoie un POST avec un payload JSON :
 *   { message: { data: base64(JSON({ emailAddress, historyId })), messageId, ... }, subscription: ... }
 *
 * On decode → on récupère le user via emailAddress (= profile.email) → on
 * appelle Gmail history.list depuis le dernier historyId stocké → pour chaque
 * change (messageAdded/messageDeleted/labelsAdded/labelsRemoved) on
 * synchronise la table messages.
 *
 * Sécurité : le secret est passé en query string ?secret=XYZ et comparé
 * à GMAIL_PUBSUB_SECRET côté env.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

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

async function syncMessage(userId: string, organisationId: string, messageId: string, accessToken: string,
                           emailToProspect: Map<string, string>) {
  const admin = getAdmin()
  // Skip si déjà en DB et labels inchangés (lazy update via fetch)
  const fullRes = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!fullRes.ok) return
  const msg = await fullRes.json()
  const labelIds = (msg.labelIds || []) as string[]
  const isUnread = labelIds.includes('UNREAD')

  // Existant ? Update is_read si change.
  const { data: existing } = await admin
    .from('messages').select('id, is_read')
    .eq('channel', 'email').eq('external_id', messageId).maybeSingle()
  if (existing) {
    if (existing.is_read === isUnread) {
      await admin.from('messages').update({ is_read: !isUnread, metadata: { label_ids: labelIds } }).eq('id', existing.id)
    }
    return
  }

  // Nouveau message — match prospect
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
  if (!prospectId) return

  const { text, html } = extractBody(msg.payload)
  const sentAt = msg.internalDate
    ? new Date(parseInt(msg.internalDate, 10)).toISOString()
    : (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString())

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

  // Validation secret
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  const expectedSecret = Deno.env.get('GMAIL_PUBSUB_SECRET') || ''
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  try {
    const body = await req.json() as { message?: { data?: string } }
    const dataB64 = body.message?.data
    if (!dataB64) return new Response('OK', { status: 204, headers: corsHeaders })

    const payload = JSON.parse(decodeBase64Url(dataB64)) as { emailAddress: string; historyId: string }
    const { emailAddress, historyId: newHistoryId } = payload

    const admin = getAdmin()

    // Trouve le user via son email
    const { data: profile } = await admin
      .from('profiles').select('id, organisation_id').eq('email', emailAddress).single()
    if (!profile) {
      console.warn(`[gmail-push] no profile for ${emailAddress}`)
      return new Response('OK', { headers: corsHeaders })
    }

    const userId = profile.id
    const organisationId = profile.organisation_id
    if (!organisationId) return new Response('OK', { headers: corsHeaders })

    const accessToken = await getValidAccessToken(userId)
    if (!accessToken) return new Response('OK', { headers: corsHeaders })

    // Récupère l'historyId stocké
    const { data: ig } = await admin
      .from('user_integrations').select('gmail_history_id')
      .eq('user_id', userId).eq('provider', 'google_calendar').single()
    const startHistoryId = ig?.gmail_history_id ? String(ig.gmail_history_id) : newHistoryId

    // Liste les changements depuis startHistoryId
    const histRes = await fetch(`${GMAIL_API}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!histRes.ok) {
      const err = await histRes.text()
      // 404 = historyId trop ancien, on relance une watch
      if (histRes.status === 404) {
        console.warn(`[gmail-push] historyId expired for ${userId}, need re-watch`)
      } else {
        console.error(`[gmail-push] history failed: ${err}`)
      }
      // Update historyId quand même pour ne pas re-process le même
      await admin.from('user_integrations').update({ gmail_history_id: parseInt(newHistoryId, 10) })
        .eq('user_id', userId).eq('provider', 'google_calendar')
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
      // Pull prospects pour matcher
      const { data: prospects } = await admin
        .from('prospects').select('id, email, email2, email3')
        .eq('organisation_id', organisationId).is('deleted_at', null)
      const emailToProspect = new Map<string, string>()
      for (const p of prospects || []) {
        for (const e of [p.email, p.email2, p.email3]) {
          if (e) emailToProspect.set(e.trim().toLowerCase(), p.id)
        }
      }

      for (const mid of messageIds) {
        try { await syncMessage(userId, organisationId, mid, accessToken, emailToProspect) }
        catch (err) { console.error(`[gmail-push] sync msg ${mid}:`, err) }
      }
    }

    // Update historyId
    await admin.from('user_integrations').update({ gmail_history_id: parseInt(newHistoryId, 10) })
      .eq('user_id', userId).eq('provider', 'google_calendar')

    return new Response('OK', { headers: corsHeaders })
  } catch (err) {
    console.error('[gmail-push-webhook] Error:', err)
    return new Response('OK', { headers: corsHeaders })
  }
})
