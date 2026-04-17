import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { renderInviteEmail } from './email-template.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// ANON_KEY plus utilisé depuis la migration JWT ES256 ; on valide le token
// via l'admin client (service_role) qui supporte les deux algos.
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'Calsyn <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:5173'

const CORS = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_ROLES = ['admin', 'manager', 'sdr'] as const
const ALLOWED_LICENSES = ['parallel', 'power', 'none'] as const

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager', sdr: 'SDR',
}
const LICENSE_LABELS: Record<string, string> = {
  parallel: 'Parallel dialer', power: 'Power dialer', none: 'Aucune',
}

function formatDuration(hours: number): string {
  if (hours <= 0) return 'une durée illimitée'
  if (hours < 1) return 'moins d\u2019une heure'
  if (hours < 24) return hours === 1 ? '1 heure' : `${hours} heures`
  if (hours === 24) return '24 heures'
  const days = Math.round(hours / 24)
  if (days === 7) return '1 semaine'
  if (days === 30) return '1 mois'
  return days === 1 ? '1 jour' : `${days} jours`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Unauthorized' }, 401)

    // Validation du JWT via le client service_role (supporte ES256 + HS256).
    // L'ancien pattern anon + auth.getUser() ne valide plus les tokens ES256 depuis
    // la migration Supabase 2025 vers les JWT asymétriques.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: { user }, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !user) return json({ error: 'Invalid session', detail: userErr?.message }, 401)
    const { data: callerProfile, error: profErr } = await admin.from('profiles')
      .select('role, organisation_id, full_name, email').eq('id', user.id).single()
    if (profErr || !callerProfile) return json({ error: 'Profile not found' }, 404)
    if (!['super_admin', 'admin', 'manager'].includes(callerProfile.role)) {
      return json({ error: 'Seuls les admins peuvent inviter' }, 403)
    }

    // Super Admin peut invite DANS une org cible (target_organisation_id).
    // Admin/Manager invite forcément dans leur propre org.
    const rawBody = await req.json().catch(() => null)
    const targetOrgId = callerProfile.role === 'super_admin' && typeof rawBody?.target_organisation_id === 'string'
      ? rawBody.target_organisation_id
      : callerProfile.organisation_id
    if (!targetOrgId) return json({ error: "Pas d'organisation cible — le Super Admin doit préciser target_organisation_id" }, 400)

    const { data: org } = await admin.from('organisations').select('name').eq('id', targetOrgId).single()
    if (!org) return json({ error: 'Organisation cible introuvable' }, 404)
    const organisationName = org?.name || 'Calsyn'

    const body = rawBody
    const email = String(body?.email || '').trim().toLowerCase()
    let role = String(body?.role || 'sdr').trim()
    let license = String(body?.call_license || 'power').trim()
    const phones = Array.isArray(body?.assigned_phones) ? body.assigned_phones.filter((p: unknown) => typeof p === 'string' && p) : []
    const workStart = typeof body?.work_hours_start === 'string' ? body.work_hours_start : '09:00'
    const workEnd = typeof body?.work_hours_end === 'string' ? body.work_hours_end : '18:00'
    const maxCalls = Number.isInteger(body?.max_calls_per_day) ? body.max_calls_per_day : 0

    // Durée d'expiration : 1h / 6h / 12h / 24h / 72h / 168h (7j) / 720h (30j) / 0 (illimité)
    // Note plateforme : le magic link Supabase natif expire à 24h max. Pour délais > 24h,
    // notre /accept-invite régénère un nouveau lien à la volée si invite_expires_at encore valide.
    const requested = Number(body?.expires_in_hours)
    let expiresInHours = Number.isFinite(requested) ? Math.round(requested) : 24
    if (expiresInHours < 0) expiresInHours = 0 // -1/autre < 0 → illimité
    const expiresAt = expiresInHours === 0
      ? null // illimité
      : new Date(Date.now() + expiresInHours * 3600_000).toISOString()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email invalide' }, 400)
    if (!ALLOWED_ROLES.includes(role as typeof ALLOWED_ROLES[number])) role = 'sdr'
    if (body?.role === 'super_admin' && callerProfile.role !== 'super_admin') role = 'admin'
    if (!ALLOWED_LICENSES.includes(license as typeof ALLOWED_LICENSES[number])) license = 'power'

    // Garde-fou : refuser l'invitation si un user existe déjà avec cet email.
    // Évite les doublons auth.users et les conflits de session.
    const { data: existing } = await admin.from('profiles').select('id, email, organisation_id, deactivated_at, last_seen_at').ilike('email', email).maybeSingle()
    if (existing) {
      if (existing.last_seen_at) {
        return json({ error: `${email} a déjà un compte actif. Utilisez « Renvoyer l'invitation » pour les users en attente.` }, 409)
      }
      if (existing.organisation_id && existing.organisation_id !== targetOrgId) {
        return json({ error: `${email} appartient déjà à une autre organisation.` }, 409)
      }
      return json({ error: `${email} a déjà une invitation en cours. Utilisez « Renvoyer l'invitation » depuis la page Équipe.` }, 409)
    }

    const metadata = {
      organisation_id: targetOrgId,
      role,
      call_license: license,
      assigned_phones: phones,
      work_hours_start: workStart,
      work_hours_end: workEnd,
      max_calls_per_day: maxCalls,
      invite_expires_at: expiresAt ?? '',
      invited_by: user.id,
    }

    const durationLabel = formatDuration(expiresInHours)

    // ── Pattern Resend (prioritaire si clé disponible) ──
    if (RESEND_API_KEY) {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: metadata,
          redirectTo: `${APP_URL}/accept-invite`,
        },
      })
      if (linkErr) return json({ error: linkErr.message }, 400)
      const actionUrl = linkData.properties?.action_link || `${APP_URL}/login`

      const inviterName = callerProfile.full_name || callerProfile.email.split('@')[0]
      const logoUrl = `${SUPABASE_URL}/functions/v1/logo`
      const { subject, html, text } = renderInviteEmail({
        email,
        inviterName,
        organisationName,
        roleLabel: ROLE_LABELS[role] || role,
        licenseLabel: LICENSE_LABELS[license] || license,
        workHoursStart: workStart,
        workHoursEnd: workEnd,
        maxCallsPerDay: maxCalls,
        actionUrl,
        phonesCount: phones.length,
        durationLabel,
        logoUrl,
      })

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [email],
          subject,
          html,
          text,
          reply_to: callerProfile.email,
        }),
      })

      if (!resendRes.ok) {
        const errText = await resendRes.text()
        return json({ error: `Envoi email échoué : ${errText}` }, 502)
      }

      return json({ ok: true, userId: linkData.user?.id, email, role, call_license: license, invite_expires_at: expiresAt, provider: 'resend' })
    }

    // ── Fallback : Supabase natif (template Dashboard) ──
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo: `${APP_URL}/accept-invite`,
    })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true, userId: data.user?.id, email, role, call_license: license, invite_expires_at: expiresAt, provider: 'supabase' })
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
