/**
 * google-auth — OAuth2 flow pour connecter Google Calendar.
 *
 * Deux actions via query param ?action=
 *   - "authorize" : redirige vers Google consent screen
 *   - "callback"  : recoit le code, echange contre tokens, stocke en DB
 *
 * Secrets requis : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  // Gmail : lecture + envoi (modify inclut readonly + send + drafts + labels)
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ')

function getRedirectUri(): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  // Edge Function URL = SUPABASE_URL/functions/v1/google-auth
  return `${supabaseUrl}/functions/v1/google-auth?action=callback`
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )
}

function getSupabaseWithAuth(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_ANON_KEY') || '',
    { global: { headers: { Authorization: authHeader } } }
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Google OAuth credentials not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── ACTION: authorize ──────────────────────────────────────────────
    // Le frontend appelle GET ?action=authorize avec son JWT dans le header.
    // On encode le user_id dans le state pour le retrouver au callback.
    if (action === 'authorize') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const supabase = getSupabaseWithAuth(authHeader)
      const _jwtAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )
    const _token = (authHeader || '').replace('Bearer ', '')
    const { data: { user }, error: authError } = await _jwtAdmin.auth.getUser(_token)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Encode user_id in state so we can link tokens on callback
      const state = btoa(JSON.stringify({ user_id: user.id }))

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: getRedirectUri(),
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
      })

      const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`

      return new Response(JSON.stringify({ url: authUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── ACTION: callback ───────────────────────────────────────────────
    // Google redirige ici avec ?code=...&state=...
    if (action === 'callback') {
      const code = url.searchParams.get('code')
      const stateParam = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        return new Response(`<html><body><h2>Authorization refused</h2><p>${error}</p><script>window.close()</script></body></html>`, {
          headers: { 'Content-Type': 'text/html' },
        })
      }

      if (!code || !stateParam) {
        return new Response(JSON.stringify({ error: 'Missing code or state' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Decode state to get user_id
      let userId: string
      try {
        const stateData = JSON.parse(atob(stateParam))
        userId = stateData.user_id
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid state parameter' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Exchange authorization code for tokens
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: getRedirectUri(),
          grant_type: 'authorization_code',
        }),
      })

      const tokenData = await tokenRes.json()

      if (!tokenRes.ok || !tokenData.access_token) {
        console.error('[google-auth] Token exchange failed:', tokenData)
        return new Response(`<html><body><h2>Token exchange failed</h2><script>window.close()</script></body></html>`, {
          headers: { 'Content-Type': 'text/html' },
        })
      }

      // Store tokens in user_integrations (upsert)
      const supabaseAdmin = getSupabaseAdmin()
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

      const { error: upsertError } = await supabaseAdmin
        .from('user_integrations')
        .upsert({
          user_id: userId,
          provider: 'google_calendar',
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          token_expires_at: expiresAt,
          scopes: SCOPES,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,provider',
        })

      if (upsertError) {
        console.error('[google-auth] Upsert error:', upsertError)
        return new Response(`<html><body><h2>Failed to save integration</h2><script>window.close()</script></body></html>`, {
          headers: { 'Content-Type': 'text/html' },
        })
      }

      // Callback HTML : ferme le popup et notifie le parent
      return new Response(`
        <html><body>
          <h2>Google Calendar connected!</h2>
          <p>This window will close automatically.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'google-calendar-connected' }, '*');
            }
            setTimeout(() => window.close(), 1500);
          </script>
        </body></html>
      `, {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // ── ACTION: disconnect ─────────────────────────────────────────────
    if (action === 'disconnect') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const supabase = getSupabaseWithAuth(authHeader)
      const _jwtAdmin2 = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      )
      const _token2 = (req.headers.get('Authorization') || '').replace('Bearer ', '')
      const { data: { user }, error: authError } = await _jwtAdmin2.auth.getUser(_token2)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const supabaseAdmin = getSupabaseAdmin()
      const { error: deleteError } = await supabaseAdmin
        .from('user_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'google_calendar')

      if (deleteError) {
        console.error('[google-auth] Delete error:', deleteError)
        return new Response(JSON.stringify({ error: 'Failed to disconnect' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── ACTION: status ─────────────────────────────────────────────────
    if (action === 'status') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const supabase = getSupabaseWithAuth(authHeader)
      const _jwtAdminB = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      )
      const _tokenB = (req.headers.get('Authorization') || '').replace('Bearer ', '')
      const { data: { user }, error: authError } = await _jwtAdminB.auth.getUser(_tokenB)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const supabaseAdmin = getSupabaseAdmin()
      const { data, error: selectError } = await supabaseAdmin
        .from('user_integrations')
        .select('provider, token_expires_at, scopes, updated_at')
        .eq('user_id', user.id)
        .eq('provider', 'google_calendar')
        .maybeSingle()

      if (selectError) {
        console.error('[google-auth] Status error:', selectError)
        return new Response(JSON.stringify({ error: 'Failed to check status' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ connected: !!data, integration: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: authorize, callback, disconnect, status' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[google-auth] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
