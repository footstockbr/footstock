import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test'

const ADMIN_EMAIL = process.env.TEST_SUPERADMIN_EMAIL ?? 'superadmin@foot-stock.test'
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'FootStock@Dev2026!'
const TEST_TICKER = process.env.TEST_TICKER ?? 'URU3'
const ANALYSIS_DAYS = '30'

type ApiPayload<T> = {
  success: boolean
  data: T
  error?: { message?: string }
}

type MotorLayersConfig = Record<string, any>

function cookieHeader(response: { headersArray(): { name: string; value: string }[] }): string {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value.split(';')[0])
    .join('; ')
}

async function login(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/v1/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(response.status()).toBe(200)
  return cookieHeader(response)
}

async function getMotorLayers(request: APIRequestContext, cookie: string): Promise<MotorLayersConfig> {
  const response = await request.get('/api/v1/admin/motor/layers', {
    headers: { cookie },
  })
  expect(response.status()).toBe(200)
  const body = (await response.json()) as ApiPayload<MotorLayersConfig>
  expect(body.success).toBe(true)
  return body.data
}

async function patchMotorLayers(
  request: APIRequestContext,
  cookie: string,
  config: MotorLayersConfig,
): Promise<MotorLayersConfig> {
  const response = await request.patch('/api/v1/admin/motor/layers', {
    headers: { cookie },
    data: config,
  })
  expect(response.status()).toBe(200)
  const body = (await response.json()) as ApiPayload<MotorLayersConfig>
  expect(body.success).toBe(true)
  return body.data
}

async function applyLoginCookiesToContext(context: BrowserContext, cookie: string): Promise<void> {
  const url = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
  const cookies = cookie
    .split(/;\s*/)
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf('=')
      return {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        url,
        sameSite: 'Lax' as const,
      }
    })

  await context.addCookies([
    ...cookies,
    { name: 'fs-admin-role', value: 'SUPER_ADMIN', url, sameSite: 'Lax' as const },
  ])
}

test.describe('Admin: camadas do motor integradas com análise de valor', () => {
  test('E2E: ajuste de camada do motor aparece no relatório por ação e na aba administrativa', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    const cookie = await login(request)
    const originalConfig = await getMotorLayers(request, cookie)
    const patchedConfig = JSON.parse(JSON.stringify(originalConfig)) as MotorLayersConfig

    patchedConfig.ou.clusters.A_TOP.theta = 0.31
    patchedConfig.ou.clusters.A_TOP.sigma = 0.0041
    patchedConfig.ou.clusters.A_TOP.spread_base = 0.0019
    patchedConfig.ofi.clusters.A_TOP.rho = 0.8899
    patchedConfig.garch.omega = 0.000003
    patchedConfig.garch.alpha = 0.2
    patchedConfig.garch.beta = 0.7
    patchedConfig.garch.vol_cap = 2.3
    patchedConfig.kylesLambda.lambda_scale = 1.7
    patchedConfig.supplyScaling.amp_cap = 3.1
    patchedConfig.pressureQueue.pressure_spread_ticks = 8
    patchedConfig.pressureQueue.absorption_ticks = 77
    patchedConfig.pressureQueue.spot_cap = 0.032
    patchedConfig.velocityCap.max_per_tick = 0.011
    patchedConfig.circuitBreaker.halt_trigger = 0.066
    patchedConfig.circuitBreaker.halt_duration_s = 121
    patchedConfig.circuitBreaker.enabled = false
    patchedConfig.sessionManagement.sessions.PRE_OPENING.vol_multiplier = 0.44
    patchedConfig.sessionManagement.sessions.TRADING.vol_multiplier = 1.14
    patchedConfig.sessionManagement.sessions.CLOSING_CALL.vol_multiplier = 0.24
    patchedConfig.sessionManagement.sessions.AFTER_MARKET.vol_multiplier = 0.11
    patchedConfig.sessionManagement.sessions.CLOSED.vol_multiplier = 0

    try {
      const savedConfig = await patchMotorLayers(request, cookie, patchedConfig)
      expect(savedConfig.updatedAt).toBeTruthy()
      expect(savedConfig.ou.clusters.A_TOP.theta).toBe(0.31)
      expect(savedConfig.sessionManagement.sessions.CLOSED.vol_multiplier).toBe(0)
      expect(savedConfig.circuitBreaker.enabled).toBe(false)

      const reloadedConfig = await getMotorLayers(request, cookie)
      expect(reloadedConfig.ou.clusters.A_TOP.spread_base).toBe(0.0019)
      expect(reloadedConfig.circuitBreaker.halt_trigger).toBe(0.066)
      expect(reloadedConfig.sessionManagement.sessions.TRADING.vol_multiplier).toBe(1.14)

      const analysisResponse = await request.get(
        `/api/v1/admin/value-analysis?ticker=${TEST_TICKER}&days=${ANALYSIS_DAYS}`,
        { headers: { cookie } },
      )
      expect(analysisResponse.status()).toBe(200)
      const analysisBody = await analysisResponse.json()
      expect(analysisBody.success).toBe(true)

      const report = analysisBody.data
      expect(report.asset.ticker).toBe(TEST_TICKER)
      expect(report.asset.cluster).toBe('A_TOP')
      expect(report.motorContext.cluster).toBe(report.asset.cluster)
      expect(report.motorContext.configSource).toBe('redis')
      expect(report.motorContext.effectiveParameters).toMatchObject({
        theta: 0.31,
        sigma: 0.0041,
        spreadBase: 0.0019,
        garchAlpha: 0.2,
        garchBeta: 0.7,
        garchOmega: 0.000003,
        garchVolCap: 2.3,
        ofiRho: 0.8899,
        lambdaScale: 1.7,
        supplyAmpCap: 3.1,
        pressureSpreadTicks: 8,
        pressureAbsorptionTicks: 77,
        pressureSpotCapPct: 3.2,
        velocityCapPct: 1.1,
        circuitBreakerPct: 6.6,
        haltDurationSeconds: 121,
      })
      expect(report.movements.length).toBeGreaterThan(0)
      expect(report.movements[0].diagnosticNotes.join(' ')).toContain('theta 0.31')

      const uiContext = await browser.newContext({
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
      })
      await uiContext.addInitScript(() => {
        localStorage.setItem('fs-cookie-consent', 'accepted')
      })
      await applyLoginCookiesToContext(uiContext, cookie)
      const page = await uiContext.newPage()

      await page.goto('/admin/analise-de-valor')
      await expect(page.locator('[data-testid="page-admin-analise-valor"]')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Análise de valor' })).toBeVisible()
      const sidebarLink = page.getByRole('link', { name: 'Análise de valor' })
      if (await sidebarLink.count()) {
        await expect(sidebarLink).toBeVisible()
      }
      await expect(page.getByText('Relatório por ativo com variações de preço')).toBeVisible()

      const assetSelect = page.locator('[data-testid="value-analysis-asset-select"]')
      await expect(assetSelect).toBeEnabled({ timeout: 25_000 })
      await page.waitForFunction(
        ({ selector, ticker }) => {
          const select = document.querySelector<HTMLSelectElement>(selector)
          return !!select && Array.from(select.options).some((option) => option.value === ticker)
        },
        { selector: '[data-testid="value-analysis-asset-select"]', ticker: TEST_TICKER },
      )
      await assetSelect.selectOption(TEST_TICKER)
      await page.locator('[data-testid="value-analysis-period-select"]').selectOption(ANALYSIS_DAYS)

      const reportResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/admin/value-analysis') &&
          response.url().includes(`ticker=${TEST_TICKER}`) &&
          response.status() === 200,
        { timeout: 30_000 },
      )
      await page.locator('[data-testid="value-analysis-generate-button"]').click()
      const reportResponse = await reportResponsePromise
      const uiReportBody = await reportResponse.json()
      expect(uiReportBody.success).toBe(true)
      expect(uiReportBody.data.asset.ticker).toBe(TEST_TICKER)

      await expect(page.getByText('Calibração do motor aplicada')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText('Cluster A_TOP').first()).toBeVisible()
      await expect(page.getByText('configuração salva pelo admin').first()).toBeVisible()
      await expect(page.getByText('0.31').first()).toBeVisible()
      await expect(page.getByText('121s').first()).toBeVisible()

      await expect(page.getByRole('tab', { name: 'Movimentos' })).toBeVisible()
      await page.getByRole('tab', { name: 'Movimentos' }).click()
      await expect(page.getByText(/Exibindo 20 de/)).toBeVisible()
      await expect(page.locator('[data-testid="value-analysis-movement-card"]')).toHaveCount(20)
      await expect(page.locator('[data-testid="value-analysis-movement-details"]')).toHaveCount(0)
      await page.locator('[data-testid="value-analysis-movement-toggle"]').first().click()
      await expect(page.locator('[data-testid="value-analysis-movement-details"]')).toHaveCount(1)
      const viewport = page.viewportSize()
      if (!viewport || viewport.width >= 700) {
        await page.locator('[data-testid="value-analysis-load-more-movements"]').click()
        await expect(page.locator('[data-testid="value-analysis-movement-card"]')).toHaveCount(40)
      }
      await expect(page.getByRole('button', { name: '[data-test]' })).toHaveCount(0)
      await uiContext.close()
    } finally {
      await patchMotorLayers(request, cookie, originalConfig)
    }
  })

  test('API rejeita GARCH invalido antes de chegar ao runtime', async ({ request }) => {
    const cookie = await login(request)
    const originalConfig = await getMotorLayers(request, cookie)
    const invalidConfig = JSON.parse(JSON.stringify(originalConfig)) as MotorLayersConfig
    invalidConfig.garch.alpha = 0.5
    invalidConfig.garch.beta = 0.5

    const response = await request.patch('/api/v1/admin/motor/layers', {
      headers: { cookie },
      data: invalidConfig,
    })
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.message).toContain('alpha + beta')
  })

  test('UI da aba Camadas usa enabled-toggle e exige salvar para persistir', async ({ browser, request }) => {
    const cookie = await login(request)
    const originalConfig = await getMotorLayers(request, cookie)

    const uiContext = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    })
    await applyLoginCookiesToContext(uiContext, cookie)
    const page = await uiContext.newPage()

    try {
      await page.goto('/admin/motor')
      await expect(page.locator('[data-testid="admin-motor-camadas"]')).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('[data-testid="admin-motor-camadas-tuning-note"]')).toContainText('Não pausa o motor')
      await page.locator('[data-testid="admin-motor-layer-ou-toggle"]').click()
      const enabledToggle = page.locator('[data-testid="admin-motor-layer-ou-enabled-toggle"]')
      await expect(enabledToggle).toHaveAttribute('role', 'switch')

      await enabledToggle.click()
      await expect(page.locator('[data-testid="admin-motor-camadas-unsaved-state"]')).toBeVisible()
      const withoutSave = await getMotorLayers(request, cookie)
      expect(withoutSave.layerToggles.ou).toBe(originalConfig.layerToggles.ou)

      await page.locator('[data-testid="admin-motor-camadas-save-button"]').click()
      await expect(page.locator('[data-testid="admin-motor-camadas-unsaved-state"]')).toHaveCount(0)
    } finally {
      await patchMotorLayers(request, cookie, originalConfig)
      await uiContext.close()
    }
  })
})
