import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_ROLES = ['admin', 'manager', 'sdr'] as const
const ALLOWED_LICENSES = ['parallel', 'power', 'none'] as const

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: userErr } = await authClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Invalid session' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: callerProfile, error: profErr } = await admin.from('profiles')
      .select('role, organisation_id').eq('id', user.id).single()
    if (profErr || !callerProfile) return json({ error: 'Profile not found' }, 404)
    if (!['super_admin', 'admin', 'manager'].includes(callerProfile.role)) {
      return json({ error: 'Seuls les admins peuvent inviter' }, 403)
    }
    if (!callerProfile.organisation_id) return json({ error: 'Pas d’organisation' }, 400)

    const body = await req.json().catch(() => null)
    const email = String(body?.email || '').trim().toLowerCase()
    let role = String(body?.role || 'sdr').trim()
    let license = String(body?.call_license || 'power').trim()
    const phones = Array.isArray(body?.assigned_phones) ? body.assigned_phones.filter((p: unknown) => typeof p === 'string' && p) : []
    const workStart = typeof body?.work_hours_start === 'string' ? body.work_hours_start : '09:00'
    const workEnd = typeof body?.work_hours_end === 'string' ? body.work_hours_end : '18:00'
    const maxCalls = Number.isInteger(body?.max_calls_per_day) ? body.max_calls_per_day : 0

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email invalide' }, 400)
    if (!ALLOWED_ROLES.includes(role as typeof ALLOWED_ROLES[number])) role = 'sdr'
    if (body?.role === 'super_admin' && callerProfile.role !== 'super_admin') role = 'admin'
    if (!ALLOWED_LICENSES.includes(license as typeof ALLOWED_LICENSES[number])) license = 'power'

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        organisation_id: callerProfile.organisation_id,
        role,
        call_license: license,
        assigned_phones: phones,
        work_hours_start: workStart,
        work_hours_end: workEnd,
        max_calls_per_day: maxCalls,
        invited_by: user.id,
      },
      redirectTo: `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/login`,
    })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true, userId: data.user?.id, email, role, call_license: license })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
