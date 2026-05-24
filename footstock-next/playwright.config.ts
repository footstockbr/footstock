import { defineConfig, devices } from '@playwright/test'

const environments = {
  development: 'http://localhost:3000',
  staging: process.env.STAGING_URL || 'https://footstock.com.br',
  production: process.env.PROD_URL || 'https://footstock.com.br',
} as const

type Env = keyof typeof environments
const testEnv = (process.env.TEST_ENV as Env) || 'development'

/**
 * Playwright config para testes E2E do Foot Stock.
 * Requer servidor rodando: `npm run dev` ou `npm run start`
 *
 * Ambientes:
 *   TEST_ENV=development  → http://localhost:3000 (padrão)
 *   TEST_ENV=staging      → staging URL
 *   TEST_ENV=production   → URL de produção (smoke tests)
 *
 * Setup: `npx playwright install --with-deps chromium`
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || environments[testEnv],
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: 'npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
      }
    : undefined,
})
