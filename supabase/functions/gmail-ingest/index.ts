/**
 * gmail-ingest — Pulls les emails récents depuis Gmail vers la table messages.
 *
 * Triggered par pg_cron toutes les 5 minutes.
 *
 * Pour chaque user ayant connecté Google :
 *  1. Refresh le token si besoin
 *  2. Query Gmail messages newer_than:5d
 *  3. Pour chaque message, match un prospect (par email from/to)
 *  4. INSERT dans messages (channel='email') avec ON CONFLICT DO NOTHING
 *
 * Idempotent grâce à UNIQUE(channel, external_id=Gmail message id).
 *
 * Auth : service_role (cron) OU user JWT (refresh manuel).
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

async function ingestForUser(userId: string, organisationId: string): Promise<{ inserted: number; checked: number }> {
  const token = await getValidAccessToken(userId)
  if (!token) return { inserted: 0, checked: 0 }

  const admin = getAdmin()

  // Pull tous les prospects de l'org pour matcher les emails
  const { data: prospects } = await admin
    .from('prospects')
    .select('id, email, email2, email3')
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
  if (!prospects || prospects.length === 0) return { inserted: 0, checked: 0 }

  const emailToProspect = new Map<string, string>()
  for (const p of prospects) {
    for (const e of [p.email, p.email2, p.email3]) {
      if (e) emailToProspect.set(e.trim().toLowerCase(), p.id)
    }
  }
  if (emailToProspect.size === 0) return { inserted: 0, checked: 0 }

  // Liste les messages récents (5 derniers jours) — limite pour éviter rate limit
  const listRes = await fetch(`${GMAIL_API}/messages?q=newer_than:5d&maxResults=100`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!listRes.ok) {
    console.error(`[gmail-ingest] List failed for user ${userId}:`, listRes.status)
    return { inserted: 0, checked: 0 }
  }
  const listData = await listRes.json() as { messages?: Array<{ id: string }> }
  const messages = listData.messages || []
  if (messages.length === 0) return { inserted: 0, checked: 0 }

  // Filtrer ceux déjà ingérés pour économiser les API calls
  const externalIds = messages.map(m => m.id)
  const { data: existing } = await admin
    .from('messages')
    .select('external_id')
    .eq('channel', 'email')
    .in('external_id', externalIds)
  const existingIds = new Set((existing || []).map(e => e.external_id))
  const toFetch = messages.filter(m => !existingIds.has(m.id))

  let inserted = 0
  for (const m of toFetch) {
    try {
      const fullRes = await fetch(`${GMAIL_API}/messages/${m.id}?format=full`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!fullRes.ok) continue
      const msg = await fullRes.json()

      const headers = msg.payload?.headers || []
      const from = getHeader(headers, 'From')
      const to = getHeader(headers, 'To')
      const subject = getHeader(headers, 'Subject')
      const dateHeader = getHeader(headers, 'Date')
      const messageId = getHeader(headers, 'Message-ID')

      // Match prospect : email du from si direction=in, email du to si direction=out
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
      if (!prospectId) continue // pas un échange avec un prospect connu

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
        metadata: { gmail_message_id: messageId, label_ids: msg.labelIds },
      })
      if (!insErr) inserted++
    } catch (err) {
      console.error(`[gmail-ingest] Error processing ${m.id}:`, err)
    }
  }

  return { inserted, checked: toFetch.length }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''

  if (!token) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const isCron = token === serviceRole
  let targetUserId: string | undefined

  if (!isCron) {
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user } } = await userClient.auth.getUser(token)
    if (!user) return new Response('Invalid JWT', { status: 401, headers: corsHeaders })
    targetUserId = user.id
  }

  const admin = getAdmin()

  // Liste des users à syncer
  const userQuery = admin
    .from('user_integrations')
    .select('user_id, profiles!inner(organisation_id)')
    .eq('provider', 'google_calendar')
  if (targetUserId) userQuery.eq('user_id', targetUserId)

  const { data: integrations } = await userQuery
  if (!integrations || integrations.length === 0) {
    return new Response(JSON.stringify({ ok: true, synced: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const results: any[] = []
  for (const ig of integrations as any[]) {
    const orgId = ig.profiles?.organisation_id
    if (!orgId) continue
    try {
      const r = await ingestForUser(ig.user_id, orgId)
      results.push({ user_id: ig.user_id, ...r })
    } catch (err) {
      console.error(`[gmail-ingest] Failed for ${ig.user_id}:`, err)
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
