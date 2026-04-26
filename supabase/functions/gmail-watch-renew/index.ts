/**
 * gmail-watch-renew — Cron quotidien qui renouvelle les Gmail watches
 * arrivant à expiration (7 jours max).
 *
 * Schedule : 0 4 * * * (4h du matin tous les jours).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { captureError } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  // Renouvelle les watches qui expirent dans < 24h ou déjà expirées
  const cutoff = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const { data: integrations } = await admin
    .from('user_integrations')
    .select('user_id')
    .eq('provider', 'google_calendar')
    .or(`gmail_watch_expires_at.is.null,gmail_watch_expires_at.lt.${cutoff}`)

  if (!integrations || integrations.length === 0) {
    return new Response(JSON.stringify({ ok: true, renewed: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Trigger watch-start pour chaque
  const results = []
  for (const ig of integrations as any[]) {
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/gmail-watch-start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceRole}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: ig.user_id }),
      })
      const data = await r.json().catch(() => ({}))
      results.push({ user_id: ig.user_id, status: r.status, ...data })
    } catch (err) {
      results.push({ user_id: ig.user_id, error: (err as Error).message })
      captureError(err, { tags: { fn: 'gmail-watch-renew' }, user: { id: ig.user_id } }).catch(() => {})
    }
  }

  return new Response(JSON.stringify({ ok: true, renewed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
