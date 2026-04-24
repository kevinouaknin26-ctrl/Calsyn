/**
 * UI/UX sweep — capture des 7 ecrans SDR critiques, screenshots +
 * console errors + network errors, desktop + mobile.
 *
 * Usage :
 *   # Installer Playwright (une fois)
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *
 *   # Variables d'environnement requises
 *   export AUDIT_BASE_URL="https://calsyn-git-audit-ui-ux-sweep-....vercel.app"
 *   export AUDIT_EMAIL="audit@staging.test"
 *   export AUDIT_PASSWORD="xxxxxxx"
 *
 *   # Lancer
 *   npx tsx .audit-ui-ux/sweep.ts
 *
 * Resultats : .audit-ui-ux/screenshots/ et .audit-ui-ux/reports/sweep-<ts>.json
 */

import { chromium, type Page, type BrowserContext, type ConsoleMessage, type Request } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE_URL = process.env.AUDIT_BASE_URL
const EMAIL = process.env.AUDIT_EMAIL
const PASSWORD = process.env.AUDIT_PASSWORD

if (!BASE_URL || !EMAIL || !PASSWORD) {
  console.error('Missing env: AUDIT_BASE_URL, AUDIT_EMAIL, AUDIT_PASSWORD')
  process.exit(1)
}

const SCREENSHOTS_DIR = resolve(__dirname, 'screenshots')
const REPORTS_DIR = resolve(__dirname, 'reports')
mkdirSync(SCREENSHOTS_DIR, { recursive: true })
mkdirSync(REPORTS_DIR, { recursive: true })

type Viewport = 'desktop' | 'mobile'
type Screen = {
  id: string
  path: string
  label: string
  waitFor?: string
  interactions?: Array<{ description: string; run: (page: Page) => Promise<void> }>
}

const SCREENS: Screen[] = [
  { id: 'login', path: '/login', label: 'Login', waitFor: 'input[type="email"]' },
  { id: 'dialer', path: '/app/dialer', label: 'Dialer', waitFor: '[data-testid="prospect-row"], table' },
  {
    id: 'prospect-modal',
    path: '/app/dialer',
    label: 'ProspectModal (ouvert)',
    waitFor: 'table',
    interactions: [
      {
        description: 'Click sur la premiere row prospect pour ouvrir le modal',
        run: async (page) => {
          const firstRow = page.locator('table tbody tr').first()
          if (await firstRow.count()) await firstRow.click()
          await page.waitForTimeout(800)
        },
      },
    ],
  },
  { id: 'history', path: '/app/history', label: 'History', waitFor: 'main' },
  { id: 'campaigns', path: '/app/campaigns', label: 'Campaigns', waitFor: 'main' },
  { id: 'settings', path: '/app/settings', label: 'Settings', waitFor: 'main' },
  { id: 'team', path: '/app/team', label: 'Team', waitFor: 'main' },
]

type Finding = {
  screen: string
  viewport: Viewport
  url: string
  console_errors: Array<{ type: string; text: string; location?: string }>
  network_errors: Array<{ url: string; status: number; method: string }>
  screenshot: string
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 })
  await page.fill('input[type="email"]', EMAIL!)
  await page.fill('input[type="password"]', PASSWORD!)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/app\//, { timeout: 20_000 })
}

async function sweepScreen(context: BrowserContext, screen: Screen, viewport: Viewport): Promise<Finding> {
  const page = await context.newPage()
  const consoleErrors: Finding['console_errors'] = []
  const networkErrors: Finding['network_errors'] = []

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const loc = msg.location()
      consoleErrors.push({
        type: msg.type(),
        text: msg.text(),
        location: loc.url ? `${loc.url}:${loc.lineNumber}` : undefined,
      })
    }
  })
  page.on('requestfailed', (req: Request) => {
    networkErrors.push({ url: req.url(), status: 0, method: req.method() })
  })
  page.on('response', (res) => {
    if (res.status() >= 400) {
      networkErrors.push({ url: res.url(), status: res.status(), method: res.request().method() })
    }
  })

  if (screen.path !== '/login') {
    await login(page)
  }

  await page.goto(`${BASE_URL}${screen.path}`)
  if (screen.waitFor) {
    try {
      await page.waitForSelector(screen.waitFor, { timeout: 10_000 })
    } catch {
      // ignore, on prend quand meme le screenshot
    }
  }
  if (screen.interactions) {
    for (const interaction of screen.interactions) {
      try { await interaction.run(page) } catch (e) {
        consoleErrors.push({ type: 'interaction-error', text: `${interaction.description}: ${(e as Error).message}` })
      }
    }
  }
  await page.waitForTimeout(500)

  const screenshotPath = resolve(SCREENSHOTS_DIR, `${screen.id}-${viewport}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })

  await page.close()

  return {
    screen: screen.id,
    viewport,
    url: `${BASE_URL}${screen.path}`,
    console_errors: consoleErrors,
    network_errors: networkErrors,
    screenshot: screenshotPath,
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const findings: Finding[] = []

  for (const viewport of ['desktop', 'mobile'] as Viewport[]) {
    const context = await browser.newContext({
      viewport: viewport === 'desktop' ? { width: 1440, height: 900 } : { width: 375, height: 812 },
      userAgent: viewport === 'mobile' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' : undefined,
    })

    for (const screen of SCREENS) {
      console.log(`[sweep] ${screen.id} ${viewport}...`)
      const finding = await sweepScreen(context, screen, viewport)
      findings.push(finding)
      console.log(`  -> ${finding.console_errors.length} console, ${finding.network_errors.length} network errors`)
    }

    await context.close()
  }

  await browser.close()

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = resolve(REPORTS_DIR, `sweep-${ts}.json`)
  writeFileSync(reportPath, JSON.stringify({ base_url: BASE_URL, timestamp: ts, findings }, null, 2))
  console.log(`\nReport written : ${reportPath}`)
  console.log(`Screenshots : ${SCREENSHOTS_DIR}`)
  console.log(`\nTotal findings : ${findings.reduce((a, f) => a + f.console_errors.length + f.network_errors.length, 0)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
