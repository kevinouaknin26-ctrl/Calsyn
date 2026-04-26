import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config — tests E2E sur la prod calsyn.app.
 *
 * Pour lancer en local : `npx playwright test`
 * Pour générer un test interactivement : `npx playwright codegen calsyn.app`
 *
 * En CI on cible la prod calsyn.app (smoke tests post-deploy). En local on peut
 * cibler un dev server via PLAYWRIGHT_BASE_URL.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Lance en parallèle sauf en CI (1 seul worker pour éviter rate limits / races sur la prod)
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://calsyn.app',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
