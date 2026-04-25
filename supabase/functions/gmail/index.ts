/**
 * gmail — Proxy vers l'API Gmail (lecture/envoi).
 *
 * Actions via ?action=
 *   - list     : liste threads filtrés (q=email_prospect)
 *   - thread   : détails d'un thread (avec ses messages)
 *   - send     : envoie un email (POST { to, subject, body, threadId? })
 *
 * Authentification : JWT Supabase. Le user.id est utilisé pour récupérer
 * son access_token Google depuis user_integrations.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

function getAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )
}

async function getValidAccessToken(userId: string): Promise<string> {
  const admin = getAdmin()
  const { data: integration, error } = await admin
    .from('user_integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .maybeSingle()
  if (error || !integration) throw new Error('Google not connected')

  // Si encore valide (>60s), on la renvoie
  const expiresAt = new Date(integration.token_expires_at).getTime()
  if (expiresAt > Date.now() + 60_000) return integration.access_token

  // Sinon on refresh
  if (!integration.refresh_token) throw new Error('No refresh token')
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
  if (!refreshRes.ok || !refreshData.access_token) throw new Error('Token refresh failed')

  await admin.from('user_integrations').update({
    access_token: refreshData.access_token,
    token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
    ...(refreshData.refresh_token ? { refresh_token: refreshData.refresh_token } : {}),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('provider', 'google_calendar')

  return refreshData.access_token
}

// Encode un message RFC 2822 en base64url pour Gmail send
function buildRFC2822(to: string, subject: string, body: string, fromHeader: string): string {
  const lines = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ]
  const raw = lines.join('\r\n')
  // base64url
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Décode un body base64url (Gmail) en string
function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  try { return decodeURIComponent(escape(atob(b64))) } catch { return atob(b64) }
}

// Extrait le texte plain d'un payload Gmail (récursif)
function extractPlainText(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const t = extractPlainText(part)
      if (t) return t
    }
  }
  // Fallback HTML stripped
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, '')
  }
  return ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const admin = getAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let accessToken: string
    try { accessToken = await getValidAccessToken(user.id) } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // ── ACTION: list (threads) ────────────────────────────────────────
    if (action === 'list') {
      const q = url.searchParams.get('q') || ''
      const maxResults = url.searchParams.get('maxResults') || '20'
      const params = new URLSearchParams({ q, maxResults })
      const res = await fetch(`${GMAIL_API}/threads?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data?.error?.message || 'Gmail list failed' }), {
          status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Pour chaque thread retourné, on récupère un sommaire via threads.get?format=metadata
      const threads = data.threads || []
      const enriched = await Promise.all(threads.slice(0, 20).map(async (t: any) => {
        const tRes = await fetch(`${GMAIL_API}/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!tRes.ok) return null
        const tData = await tRes.json()
        const lastMsg = tData.messages?.[tData.messages.length - 1]
        const headers = lastMsg?.payload?.headers || []
        const getH = (n: string) => headers.find((h: any) => h.name === n)?.value || ''
        return {
          id: tData.id,
          snippet: tData.messages?.[0]?.snippet || '',
          subject: getH('Subject'),
          from: getH('From'),
          to: getH('To'),
          date: getH('Date'),
          messageCount: tData.messages?.length || 1,
          unread: tData.messages?.some((m: any) => (m.labelIds || []).includes('UNREAD')) || false,
        }
      }))
      return new Response(JSON.stringify({ threads: enriched.filter(Boolean) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── ACTION: thread (détails + messages) ───────────────────────────
    if (action === 'thread') {
      const threadId = url.searchParams.get('id')
      if (!threadId) {
        return new Response(JSON.stringify({ error: 'Missing thread id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const res = await fetch(`${GMAIL_API}/threads/${threadId}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data?.error?.message || 'Thread fetch failed' }), {
          status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const messages = (data.messages || []).map((m: any) => {
        const headers = m.payload?.headers || []
        const getH = (n: string) => headers.find((h: any) => h.name === n)?.value || ''
        return {
          id: m.id,
          from: getH('From'),
          to: getH('To'),
          subject: getH('Subject'),
          date: getH('Date'),
          snippet: m.snippet,
          body: extractPlainText(m.payload),
        }
      })
      return new Response(JSON.stringify({ id: data.id, messages }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── ACTION: send ──────────────────────────────────────────────────
    if (action === 'send' && req.method === 'POST') {
      const body = await req.json()
      const { to, subject, body: emailBody, threadId } = body
      if (!to || !subject || !emailBody) {
        return new Response(JSON.stringify({ error: 'Missing to/subject/body' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Récupère l'adresse "me" pour le From
      const profileRes = await fetch(`${GMAIL_API}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const profileData = await profileRes.json()
      const fromAddress = profileData.emailAddress || user.email || ''

      const raw = buildRFC2822(to, subject, emailBody, fromAddress)
      const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
      })
      const sendData = await sendRes.json()
      if (!sendRes.ok) {
        return new Response(JSON.stringify({ error: sendData?.error?.message || 'Send failed' }), {
          status: sendRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, messageId: sendData.id, threadId: sendData.threadId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[gmail] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
