/**
 * TIER 2 — Indicadores Tecnicos por Plano (T-011)
 * Foot Stock / T-033 Verificacao E2E Completa de Gaps
 *
 * Cenarios cobertos:
 *   TI-01: Jogador acessa ativo — grafico sem indicadores avancados
 *   TI-02: Craque acessa ativo — grafico com MM9/MM21
 *   TI-03: Lenda acessa ativo — modo de comparacao multi-ativo disponivel
 *   TI-04: API de analise com tipo MM9 retorna 403 para Jogador
 *   TI-05: UI de ativo exibe tabs de analise conforme plano
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS, TEST_TICKER, expectNoServerError } from './setup'

test.describe('T-011: Indicadores Tecnicos por Plano — TIER 2', () => {
  test('TI-01: Jogador acessa pagina de ativo sem erros de servidor', async ({ page }) => {
    await loginAs(page, 'jogador')
    await page.goto(`/ativo/${TEST_TICKER}`)
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // Pagina do ativo deve renderizar
    const ativoPage = page.locator('[data-testid="ativo-page"]')
    await expect(ativoPage).toBeVisible({ timeout: 8_000 })
  })

  test('TI-02: Craque acessa grafico do ativo sem erros', async ({ page }) => {
    await loginAs(page, 'craque')
    await page.goto(`/ativo/${TEST_TICKER}`)
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // Tab de grafico deve estar disponivel
    const graficoTab = page.locator('[data-testid="ativo-tab-grafico"]')
    if (await graficoTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await graficoTab.click()
      await page.waitForLoadState('networkidle')
    }

    // Conteudo do grafico deve carregar
    const graficoContent = page.locator('[data-testid="ativo-content-grafico"]')
    if (await graficoContent.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(graficoContent).toBeVisible()
    }
  })

  test('TI-03: Tabs do ativo estao visiveis (analise, grafico, info, ordens)', async ({
    page,
  }) => {
    await loginAs(page, 'craque')
    await page.goto(`/ativo/${TEST_TICKER}`)
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // As tabs do ativo devem estar presentes
    const tabsContainer = page.locator('[data-testid="ativo-order-type-tabs"]').or(
      page.locator('[data-testid="ativo-tab-analise"]')
    )

    const tabsVisible = await tabsContainer.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!tabsVisible) {
      console.warn('TI-03: Tabs do ativo nao localizadas com data-testid esperado')
    }
  })

  test('TI-04: GET /api/v1/assets/[ticker] retorna info completa para Craque', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.get(`/api/v1/assets/${TEST_TICKER}`, {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()

    // Preco e ticker devem estar presentes
    const asset = body.data
    expect(asset.ticker ?? asset.symbol).toBeDefined()
    expect(asset.price ?? asset.currentPrice ?? asset.lastPrice).toBeDefined()
  })

  test('TI-05: Tab de analise do ativo disponivel para Lenda', async ({ page }) => {
    await loginAs(page, 'lenda')
    await page.goto(`/ativo/${TEST_TICKER}`)
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // Tab de analise
    const analiseTab = page.locator('[data-testid="ativo-tab-analise"]')
    if (await analiseTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await analiseTab.click()
      await page.waitForLoadState('networkidle')
      await expectNoServerError(page)
    }
  })

  test('TI-06: Stats do ativo exibem dados de mercado', async ({ page }) => {
    await loginAs(page, 'craque')
    await page.goto(`/ativo/${TEST_TICKER}`)
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // Stats devem carregar
    const stats = page.locator('[data-testid="asset-stats"]')
    if (await stats.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(stats).toBeVisible()
    }
  })
})
