/**
 * google-calendar — Proxy vers l'API Google Calendar.
 * Auth : JWT Supabase requis.
 *
 * Actions via query param ?action=
 *   - "list"   : liste les events (params: timeMin, timeMax, maxResults, calendarId)
 *   - "create" : cree un event (body JSON avec event data)
 *
 * Gere le refresh automatique des tokens expires.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

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

/**
 * Refresh le token si expire (ou presque expire, 5 min de marge).
 * Retourne le access_token valide.
 */
async function getValidAccessToken(userId: string): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: integration, error } = await supabaseAdmin
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .single()

  if (error || !integration) {
    throw new Error('Google Calendar not connected')
  }

  const expiresAt = new Date(integration.token_expires_at).getTime()
  const now = Date.now()
  const FIVE_MIN = 5 * 60 * 1000

  // Token encore valide
  if (expiresAt - now > FIVE_MIN) {
    return integration.access_token
  }

  // Token expire ou presque — refresh
  if (!integration.refresh_token) {
    throw new Error('No refresh token available. User must re-authorize.')
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

  const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  const refreshData = await refreshRes.json()

  if (!refreshRes.ok || !refreshData.access_token) {
    console.error('[google-calendar] Token refresh failed:', refreshData)
    throw new Error('Token refresh failed. User must re-authorize.')
  }

  // Update stored tokens
  const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
  await supabaseAdmin
    .from('user_integrations')
    .update({
      access_token: refreshData.access_token,
      token_expires_at: newExpiresAt,
      // Google ne renvoie pas toujours un nouveau refresh_token
      ...(refreshData.refresh_token ? { refresh_token: refreshData.refresh_token } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')

  return refreshData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth check
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

    // Get valid Google access token (auto-refresh si besoin)
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(user.id)
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // ── ACTION: list ─────────────────────────────────────────────────
    if (action === 'list') {
      const calendarId = url.searchParams.get('calendarId') || 'primary'
      const timeMin = url.searchParams.get('timeMin') || new Date().toISOString()
      const timeMax = url.searchParams.get('timeMax') || ''
      const maxResults = url.searchParams.get('maxResults') || '50'

      const params = new URLSearchParams({
        timeMin,
        maxResults,
        singleEvents: 'true',
        orderBy: 'startTime',
      })
      if (timeMax) params.set('timeMax', timeMax)

      const calRes = await fetch(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      const calData = await calRes.json()

      if (!calRes.ok) {
        console.error('[google-calendar] List events failed:', calData)
        return new Response(JSON.stringify({ error: 'Failed to list events', details: calData.error }), {
          status: calRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify(calData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── ACTION: create ───────────────────────────────────────────────
    if (action === 'create') {
      const body = await req.json()
      const calendarId = body.calendarId || 'primary'

      // Expected body.event shape: { summary, description?, start, end, attendees?, ... }
      if (!body.event) {
        return new Response(JSON.stringify({ error: 'Missing event object in body' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const calRes = await fetch(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body.event),
        }
      )

      const calData = await calRes.json()

      if (!calRes.ok) {
        console.error('[google-calendar] Create event failed:', calData)
        return new Response(JSON.stringify({ error: 'Failed to create event', details: calData.error }), {
          status: calRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify(calData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: list, create' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[google-calendar] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
