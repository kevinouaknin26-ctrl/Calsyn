/**
 * gmail-watch-start — Démarre la "watch" Gmail pour un user.
 *
 * Appelée :
 *  - manuellement après que l'user a connecté Google (action depuis le front)
 *  - par gmail-watch-renew (cron) quand la watch expire (max 7 jours)
 *
 * Préreq Google Cloud (à faire 1 fois côté admin) :
 *  1. Activer l'API Cloud Pub/Sub sur le project Google Cloud
 *  2. Créer un topic, ex: 'gmail-notifications'
 *  3. Donner au service account 'gmail-api-push@system.gserviceaccount.com'
 *     le rôle 'pubsub.publisher' sur ce topic
 *  4. Créer une subscription PUSH sur ce topic, endpoint =
 *     https://enrpuayypjnpfmdgpfhs.supabase.co/functions/v1/gmail-push-webhook?secret=<SECRET>
 *  5. Setter env vars Supabase :
 *      - GMAIL_PUBSUB_TOPIC = 'projects/<your-project>/topics/gmail-notifications'
 *      - GMAIL_PUBSUB_SECRET = '<un secret aléatoire>' (validé par le webhook)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { corsHeaders } from '../_shared/cors.ts'
import { captureError } from '../_shared/sentry.ts'

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

async function startWatchForUser(userId: string): Promise<{ ok: boolean; historyId?: string; expiration?: string; error?: string }> {
  const topicName = Deno.env.get('GMAIL_PUBSUB_TOPIC') || ''
  if (!topicName) return { ok: false, error: 'GMAIL_PUBSUB_TOPIC not configured' }

  const token = await getValidAccessToken(userId)
  if (!token) return { ok: false, error: 'No valid access token' }

  const watchRes = await fetch(`${GMAIL_API}/watch`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topicName,
      labelIds: ['INBOX', 'SENT'],
      labelFilterBehavior: 'INCLUDE',
    }),
  })
  if (!watchRes.ok) {
    const err = await watchRes.text()
    return { ok: false, error: `watch failed: ${err}` }
  }
  const data = await watchRes.json() as { historyId: string; expiration: string }

  const admin = getAdmin()
  await admin.from('user_integrations').update({
    gmail_history_id: parseInt(data.historyId, 10),
    gmail_watch_expires_at: new Date(parseInt(data.expiration, 10)).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('provider', 'google_calendar')

  return { ok: true, historyId: data.historyId, expiration: data.expiration }
}

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''

  if (!token) return new Response('Unauthorized', { status: 401, headers: cors })

  const isCron = token === serviceRole
  let targetUserId: string | undefined

  if (!isCron) {
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user } } = await userClient.auth.getUser(token)
    if (!user) return new Response('Invalid JWT', { status: 401, headers: cors })
    targetUserId = user.id
  }

  const admin = getAdmin()
  let q = admin.from('user_integrations').select('user_id').eq('provider', 'google_calendar')
  if (targetUserId) q = q.eq('user_id', targetUserId)
  const { data: integrations } = await q
  if (!integrations || integrations.length === 0) {
    return new Response(JSON.stringify({ ok: true, started: 0 }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const results = []
  for (const ig of integrations as any[]) {
    try {
      const r = await startWatchForUser(ig.user_id)
      results.push({ user_id: ig.user_id, ...r })
    } catch (err) {
      results.push({ user_id: ig.user_id, error: (err as Error).message })
      captureError(err, { tags: { fn: 'gmail-watch-start' }, user: { id: ig.user_id } }).catch(() => {})
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
