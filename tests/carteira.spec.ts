// ============================================================================
// FootStock — E2E: /carteira com Posições, Shorts, Extrato (Playwright)
// Rastreabilidade: INT-034, INT-035, INT-036
// ============================================================================

import { test, expect } from '@playwright/test'

async function loginWithTestSession(page: import('@playwright/test').Page) {
  await page.context().addCookies([
    {
      name: 'sb-access-token',
      value: process.env.E2E_SESSION_TOKEN ?? 'test-token',
      domain: 'localhost',
      path: '/',
    },
  ])
}

test.describe('/carteira — Tabs completas', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithTestSession(page)
    await page.goto('/carteira')
    await page.waitForLoadState('networkidle')
  })

  test('CAR-E2E-01: 4 abas visíveis e funcionais', async ({ page }) => {
    const posicoesTabs = page.getByRole('tab', { name: /posições/i })
    const shortsTabs = page.getByRole('tab', { name: /shorts/i })
    const extratoTabs = page.getByRole('tab', { name: /extrato/i })
    const dividendosTabs = page.getByRole('tab', { name: /dividendos/i })

    await expect(posicoesTabs).toBeVisible()
    await expect(shortsTabs).toBeVisible()
    await expect(extratoTabs).toBeVisible()
    await expect(dividendosTabs).toBeVisible()
  })

  test('CAR-E2E-02: aba Posições exibe conteúdo ao clicar', async ({ page }) => {
    const posicoesTabs = page.getByRole('tab', { name: /posições/i })
    await posicoesTabs.click()
    await page.waitForLoadState('networkidle')

    // Verificar que conteúdo de posições está visível
    const positionsList = page.locator('[role="list"][aria-label*="Posições"]')
    const isVisible = await positionsList.isVisible().catch(() => false)

    // Pode estar vazio ou com posições
    expect(isVisible || (await page.locator('text=/Carteira vazia|Posição em/i').isVisible())).toBe(true)
  })

  test('CAR-E2E-03: aba Shorts exibe conteúdo ao clicar', async ({ page }) => {
    const shortsTabs = page.getByRole('tab', { name: /shorts/i })
    await shortsTabs.click()
    await page.waitForLoadState('networkidle')

    // Verificar que conteúdo de shorts está visível
    const isVisible = await page
      .locator('text=/Vendas a Descoberto|Sem posições short|Posição em/i')
      .isVisible()

    expect(isVisible).toBe(true)
  })

  test('CAR-E2E-04: aba Extrato exibe conteúdo ao clicar', async ({ page }) => {
    const extratoTabs = page.getByRole('tab', { name: /extrato/i })
    await extratoTabs.click()
    await page.waitForLoadState('networkidle')

    // Verificar que conteúdo de extrato está visível
    const isVisible = await page
      .locator('text=/Extrato|Todas|Agendadas|Limitadas|OCO|Sem transações/i')
      .isVisible()

    expect(isVisible).toBe(true)
  })

  test('CAR-E2E-05: aba padrão é Posições', async ({ page }) => {
    const posicoesTabs = page.getByRole('tab', { name: /posições/i })
    const ariaSelected = await posicoesTabs.getAttribute('aria-selected')

    expect(ariaSelected).toBe('true')
  })
})
