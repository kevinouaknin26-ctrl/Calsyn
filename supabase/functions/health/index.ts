/**
 * health — Endpoint de health check public (no auth).
 *
 * Vérifie :
 *  - DB Supabase joignable (SELECT 1 sur une table)
 *  - Variables d'env critiques présentes
 *  - Latence DB
 *
 * GET /functions/v1/health → 200 { status: 'ok', checks: {...} } | 503 si KO
 *
 * Branchable sur :
 *  - UptimeRobot / BetterStack (alertes externes)
 *  - Vercel rewrite vers /health pour exposition front
 *
 * DEPLOY : `supabase functions deploy health --no-verify-jwt`
 * (endpoint public, pas d'auth requise, doit répondre même si Supabase Auth down)
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VERSION = '1.0.0'
const STARTED_AT = Date.now()

interface CheckResult {
  ok: boolean
  latency_ms?: number
  error?: string
}

async function checkDb(): Promise<CheckResult> {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) return { ok: false, error: 'missing_env' }
  try {
    const t0 = Date.now()
    const admin = createClient(url, key)
    const { error } = await admin.from('organisations').select('id', { count: 'exact', head: true }).limit(1)
    if (error) return { ok: false, error: error.message }
    return { ok: true, latency_ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

function checkEnv(): CheckResult {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const missing = required.filter(k => !Deno.env.get(k))
  if (missing.length > 0) return { ok: false, error: `missing: ${missing.join(',')}` }
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    })
  }

  const [db, env] = await Promise.all([checkDb(), Promise.resolve(checkEnv())])
  const allOk = db.ok && env.ok

  const body = {
    status: allOk ? 'ok' : 'degraded',
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime_ms: Date.now() - STARTED_AT,
    checks: { db, env },
  }

  return new Response(JSON.stringify(body, null, 2), {
    status: allOk ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
