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
import { captureError } from '../_shared/sentry.ts'

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

interface AttachmentInput {
  filename: string
  mimeType?: string
  mime?: string  // legacy
  base64?: string
  data?: string  // legacy
}

// Encode un message RFC 2822 en base64url pour Gmail send.
// Si attachments : multipart/mixed avec text/plain + chaque PJ en base64.
function buildRFC2822(
  to: string, subject: string, body: string, fromHeader: string,
  attachments: AttachmentInput[] = []
): string {
  const subjectEnc = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`
  let raw: string

  if (!attachments || attachments.length === 0) {
    // Simple text/plain
    const lines = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      `Subject: ${subjectEnc}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
    ]
    raw = lines.join('\r\n')
  } else {
    // Multipart : 1 part text/plain + N parts attachments
    const boundary = `=_calsyn_${Math.random().toString(36).slice(2)}_${Date.now()}`
    const parts: string[] = []

    // Body part
    parts.push([
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
    ].join('\r\n'))

    // Attachments parts
    for (const a of attachments) {
      const data = a.base64 || a.data || ''
      const mime = a.mimeType || a.mime || 'application/octet-stream'
      const filenameEnc = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(a.filename)))}?=`
      parts.push([
        `--${boundary}`,
        `Content-Type: ${mime}; name="${filenameEnc}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${filenameEnc}"`,
        '',
        // Découpe en lignes de 76 chars (RFC standard)
        data.match(/.{1,76}/g)?.join('\r\n') || data,
      ].join('\r\n'))
    }

    parts.push(`--${boundary}--`)

    const headers = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      `Subject: ${subjectEnc}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
    ].join('\r\n')

    raw = headers + '\r\n' + parts.join('\r\n')
  }

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
      let { to, subject, body: emailBody, threadId, thread_id, prospect_id } = body
      const attachments: AttachmentInput[] = body.attachments || []
      // Channel registry envoie thread_id (snake_case) ; fallback sur threadId (camel)
      threadId = threadId || thread_id

      // Si pas de 'to' explicite, lookup via prospect_id (cas messagerie unifiée)
      let prospectInfo: { id: string; email: string | null; organisation_id: string } | null = null
      if (prospect_id) {
        const { data: p } = await admin
          .from('prospects')
          .select('id, email, organisation_id')
          .eq('id', prospect_id)
          .single()
        if (p) prospectInfo = p
        if (!to) to = p?.email
      }

      if (!to || !emailBody) {
        return new Response(JSON.stringify({ error: 'Missing to/body' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Subject vide accepté pour les replies (Gmail garde le subject original via threadId)
      const finalSubject = subject || ''

      const profileRes = await fetch(`${GMAIL_API}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const profileData = await profileRes.json()
      const fromAddress = profileData.emailAddress || user.email || ''

      const raw = buildRFC2822(to, finalSubject, emailBody, fromAddress, attachments)
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

      // INSERT direct dans messages (channel='email', direction='out') pour
      // affichage instantané sans attendre le cron gmail-ingest.
      if (prospectInfo) {
        try {
          await admin.from('messages').insert({
            organisation_id: prospectInfo.organisation_id,
            prospect_id: prospectInfo.id,
            user_id: user.id,
            channel: 'email',
            direction: 'out',
            external_id: sendData.id,
            external_thread_id: sendData.threadId,
            from_address: fromAddress,
            to_address: to,
            subject: finalSubject || null,
            body: emailBody,
            sent_at: new Date().toISOString(),
            status: 'sent',
            is_read: true,
            metadata: { sent_via: 'calsyn' },
          })
        } catch (insErr) {
          console.error('[gmail/send] insert messages failed:', insErr)
          // Pas bloquant : le mail est parti, le cron gmail-ingest le ramassera plus tard.
        }
      }

      return new Response(JSON.stringify({ ok: true, messageId: sendData.id, threadId: sendData.threadId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── ACTION: mark-read ─────────────────────────────────────────────
    // Retire le label UNREAD sur Gmail + update is_read=true en local pour
    // tous les messages email du prospect (direction='in', is_read=false).
    if (action === 'mark-read' && req.method === 'POST') {
      const body = await req.json()
      const { prospect_id, force } = body
      if (!prospect_id) {
        return new Response(JSON.stringify({ error: 'Missing prospect_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Récupère les messages email du prospect.
      // Si force=true : tous les emails inbound (pour récupérer le désync local/Gmail).
      // Sinon : seulement les non-lus en local.
      let q = admin
        .from('messages')
        .select('id, external_id')
        .eq('prospect_id', prospect_id)
        .eq('channel', 'email')
        .eq('direction', 'in')
      if (!force) q = q.eq('is_read', false)
      const { data: msgs } = await q
      if (!msgs || msgs.length === 0) {
        return new Response(JSON.stringify({ ok: true, updated: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Batch modify Gmail (retire UNREAD) — max 1000 par appel
      const ids = msgs.map(m => m.external_id).filter(Boolean) as string[]
      let gmailStatus: number | null = null
      let gmailError: string | null = null
      if (ids.length > 0) {
        try {
          const bmRes = await fetch(`${GMAIL_API}/messages/batchModify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids.slice(0, 1000), removeLabelIds: ['UNREAD'] }),
          })
          gmailStatus = bmRes.status
          if (!bmRes.ok) {
            const errText = await bmRes.text()
            gmailError = errText.slice(0, 500)
            console.error('[gmail/mark-read] batchModify HTTP', bmRes.status, errText)
          } else {
            console.log('[gmail/mark-read] batchModify OK for', ids.length, 'msgs')
          }
        } catch (err) {
          gmailError = (err as Error).message
          console.error('[gmail/mark-read] batchModify threw:', err)
        }
      }

      // Update local is_read=true (UX prioritaire). L'erreur Gmail est remontée
      // séparément dans la réponse pour diagnostic, mais on n'y subordonne plus l'UX.
      const { data: updated } = await admin
        .from('messages')
        .update({ is_read: true })
        .in('id', msgs.map(m => m.id))
        .eq('is_read', false)  // ne fait quelque chose que si nécessaire
        .select('id')
      const updatedCount = updated?.length || 0

      return new Response(JSON.stringify({
        ok: !gmailError,
        updated: updatedCount,
        gmail_ids: ids.length,
        gmail_status: gmailStatus,
        gmail_error: gmailError,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[gmail] Error:', err)
    const url = new URL(req.url)
    captureError(err, {
      tags: { fn: 'gmail', action: url.searchParams.get('action') || 'unknown', method: req.method },
    }).catch(() => {})
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
