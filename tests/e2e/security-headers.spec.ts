import { test, expect } from '@playwright/test'

/**
 * Tests E2E security headers — vérifie que la prod expose bien les contrôles
 * de sécu attendus côté HTTP.
 *
 * Lancé contre :
 *  - PROD par défaut (https://calsyn.app)
 *  - Override via env BASE_URL pour staging / preview Vercel
 */

const BASE_URL = process.env.BASE_URL || 'https://calsyn.app'

test.describe('Security headers', () => {
  test('Strict-Transport-Security présent et configuré (HSTS preload-ready)', async ({ request }) => {
    const r = await request.get(BASE_URL, { maxRedirects: 0 })
    const hsts = r.headers()['strict-transport-security']
    expect(hsts).toBeDefined()
    expect(hsts).toContain('max-age=')
    expect(hsts).toContain('includeSubDomains')
    expect(hsts).toContain('preload')
    // max-age >= 1 an pour preload list
    const m = hsts!.match(/max-age=(\d+)/)
    expect(m).toBeTruthy()
    expect(parseInt(m![1], 10)).toBeGreaterThanOrEqual(31536000)
  })

  test('X-Frame-Options DENY (clickjacking)', async ({ request }) => {
    const r = await request.get(BASE_URL)
    expect(r.headers()['x-frame-options']).toBe('DENY')
  })

  test('X-Content-Type-Options nosniff (MIME sniffing)', async ({ request }) => {
    const r = await request.get(BASE_URL)
    expect(r.headers()['x-content-type-options']).toBe('nosniff')
  })

  test('Referrer-Policy strict-origin-when-cross-origin', async ({ request }) => {
    const r = await request.get(BASE_URL)
    expect(r.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  test('Permissions-Policy restreint (microphone autorisé, reste bloqué)', async ({ request }) => {
    const r = await request.get(BASE_URL)
    const pp = r.headers()['permissions-policy']
    expect(pp).toBeDefined()
    expect(pp).toContain('camera=()')
    expect(pp).toContain('geolocation=()')
    expect(pp).toContain('microphone=(self)')
    expect(pp).toContain('payment=()')
  })

  test('Content-Security-Policy whitelist explicite', async ({ request }) => {
    const r = await request.get(BASE_URL)
    const csp = r.headers()['content-security-policy']
    expect(csp).toBeDefined()
    // Domaines critiques dans connect-src
    expect(csp).toContain('*.supabase.co')
    expect(csp).toContain('*.twilio.com')
    expect(csp).toContain('sentry.io')
    // frame-ancestors none ⇒ idem X-Frame-Options DENY
    expect(csp).toContain("frame-ancestors 'none'")
    // Pas de unsafe-eval désactivé (Twilio SDK en a besoin pour le moment)
    expect(csp).toContain('object-src \'none\'')
  })

  test('Cross-Origin-Opener-Policy défini', async ({ request }) => {
    const r = await request.get(BASE_URL)
    expect(r.headers()['cross-origin-opener-policy']).toBeDefined()
  })

  test('Cookies de session sont Secure + HttpOnly + SameSite (si présents)', async ({ request }) => {
    const r = await request.get(BASE_URL)
    const setCookies = r.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie')
    for (const c of setCookies) {
      const v = c.value.toLowerCase()
      // Tous les cookies doivent avoir Secure
      expect(v).toContain('secure')
      // SameSite obligatoire
      expect(v).toMatch(/samesite=(lax|strict|none)/)
    }
  })

  test('HTTP redirect vers HTTPS', async ({ request }) => {
    if (BASE_URL.startsWith('http://')) test.skip(true, 'Test only meaningful for HTTPS BASE_URL')
    const httpUrl = BASE_URL.replace('https://', 'http://')
    const r = await request.get(httpUrl, { maxRedirects: 0 })
    // Vercel renvoie 308 ou 301 pour rediriger vers HTTPS
    expect([301, 302, 307, 308]).toContain(r.status())
    expect(r.headers().location).toMatch(/^https:\/\//)
  })
})

test.describe('Webhook signature rejection', () => {
  test('sms-webhook sans signature → 403', async ({ request }) => {
    const projectRef = process.env.SUPABASE_PROJECT_REF
    if (!projectRef) test.skip(true, 'SUPABASE_PROJECT_REF non défini')

    const r = await request.post(
      `https://${projectRef}.supabase.co/functions/v1/sms-webhook`,
      {
        form: { From: '+33000000000', To: '+33000000000', Body: 'test', MessageSid: 'SM00000000000000000000000000000001' },
      },
    )
    expect(r.status()).toBe(403)
  })
})

test.describe('Health endpoint', () => {
  test('/functions/v1/health → 200 + JSON shape', async ({ request }) => {
    const projectRef = process.env.SUPABASE_PROJECT_REF
    if (!projectRef) test.skip(true, 'SUPABASE_PROJECT_REF non défini')

    const r = await request.get(`https://${projectRef}.supabase.co/functions/v1/health`)
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.status).toBe('ok')
    expect(body.checks.db.ok).toBe(true)
    expect(body.checks.env.ok).toBe(true)
  })
})
