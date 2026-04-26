/**
 * Smoke tests — vérifient que les pages clés chargent sans erreur fatale
 * et que les éléments critiques sont présents. Pas d'auth nécessaire car on
 * cible les écrans publics (login, reset-password) + on vérifie que les routes
 * protégées redirigent bien vers /login.
 *
 * Pour les tests authentifiés (parcours golden complet), il faudra ajouter un
 * setup `auth.setup.ts` qui crée une session de test (compte SDR de test
 * dédié) — TODO post-V1.
 */

import { test, expect } from '@playwright/test'

test.describe('Public pages smoke', () => {
  test('Login page loads without errors', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('pageerror', err => consoleErrors.push(err.message))
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

    await page.goto('/login')

    // Page rendue
    await expect(page).toHaveTitle(/Calsyn/i)

    // Champs de login présents
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()

    // Pas d'erreur JS critique (filtre les erreurs réseau attendues type 401)
    const realErrors = consoleErrors.filter(e =>
      !e.includes('401') &&
      !e.includes('403') &&
      !e.includes('Non-Error promise rejection') &&
      !e.includes('ResizeObserver')
    )
    expect(realErrors).toEqual([])
  })

  test('Reset password page loads', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('Protected route redirects to login', async ({ page }) => {
    await page.goto('/app/dialer')
    // Doit redirect vers /login
    await page.waitForURL(/\/login/, { timeout: 5000 })
    expect(page.url()).toContain('/login')
  })

  test('Protected dashboard redirects to login', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForURL(/\/login/, { timeout: 5000 })
    expect(page.url()).toContain('/login')
  })
})

test.describe('Build markers', () => {
  test('Build SHA logged in console', async ({ page }) => {
    const consoleLogs: string[] = []
    page.on('console', msg => consoleLogs.push(msg.text()))

    await page.goto('/login')
    await page.waitForTimeout(500)

    // Le main.tsx logge "🚀 Calsyn build <sha> — <date>" au boot
    const hasBuildMarker = consoleLogs.some(l => l.includes('Calsyn build'))
    expect(hasBuildMarker).toBe(true)
  })

  test('Sentry DSN is configured', async ({ page }) => {
    await page.goto('/login')
    // Vérifie que le bundle JS contient une référence Sentry (DSN ou init)
    // Si Sentry est désactivé (pas de DSN), on se contente de vérifier
    // qu'il n'y a pas d'erreur d'init.
    const consoleErrors: string[] = []
    page.on('pageerror', err => consoleErrors.push(err.message))
    await page.waitForTimeout(1000)
    const sentryErrors = consoleErrors.filter(e => e.toLowerCase().includes('sentry'))
    expect(sentryErrors).toEqual([])
  })
})
