// ============================================================================
// Foot Stock — Acessibilidade /mercado (Playwright + axe-core)
// WCAG 2.1 AA: zero violations, navegação por teclado, aria-pressed, CLS.
// Requer servidor rodando em BASE_URL (default: http://localhost:3000)
// com usuário autenticado mockado via cookie de sessão.
// ============================================================================

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Helper: injeta cookie de sessão de teste (necessário para /mercado não redirecionar)
async function loginWithTestSession(page: import('@playwright/test').Page) {
  // Injeta um cookie de sessão de teste
  await page.context().addCookies([
    {
      name: 'sb-access-token',
      value: process.env.E2E_SESSION_TOKEN ?? 'test-token',
      domain: 'localhost',
      path: '/',
    },
  ])
}

test.describe('/mercado — Acessibilidade (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithTestSession(page)
  })

  // ── A11Y-01: axe-core zero violações ────────────────────────────────────
  test('A11Y-01: axe-core não reporta violações WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/mercado')
    await page.waitForSelector('[data-testid="market-search-input"]', { timeout: 10_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // Excluir elementos de skeleton que não são interativos durante carregamento
      .exclude('[aria-hidden="true"]')
      .analyze()

    expect(results.violations).toHaveLength(0)
  })

  // ── A11Y-02: Tab navega para AssetCards ─────────────────────────────────
  test('A11Y-02: Tab percorre AssetCards e todos têm role=button', async ({ page }) => {
    await page.goto('/mercado')
    await page.waitForSelector('[role="button"][data-testid^="asset-card"]', { timeout: 10_000 })

    // Primeiro Tab vai para o search
    await page.keyboard.press('Tab')
    const focused1 = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
    expect(focused1).toBe('market-search-input')

    // Continua Tabs para alcançar os filtros e depois os cards
    // Navega até encontrar um AssetCard focado
    let foundCard = false
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      const role = await page.evaluate(() => document.activeElement?.getAttribute('role'))
      const testId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
      if (role === 'button' && testId?.startsWith('asset-card-')) {
        foundCard = true
        break
      }
    }

    expect(foundCard).toBe(true)
  })

  // ── A11Y-03: Enter em AssetCard navega para detalhe ──────────────────────
  test('A11Y-03: Enter em AssetCard navega para /mercado/{ticker}', async ({ page }) => {
    await page.goto('/mercado')
    await page.waitForSelector('[role="button"][data-testid^="asset-card-"]', { timeout: 10_000 })

    // Foca o primeiro AssetCard via Tab
    let ticker: string | null = null
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      const testId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
      if (testId?.startsWith('asset-card-')) {
        ticker = testId.replace('asset-card-', '')
        break
      }
    }

    expect(ticker).not.toBeNull()

    await page.keyboard.press('Enter')
    await page.waitForURL(`**/mercado/${ticker}`, { timeout: 5_000 })

    expect(page.url()).toContain(`/mercado/${ticker}`)
  })

  // ── A11Y-04: Escape limpa o campo de busca ───────────────────────────────
  test('A11Y-04: Escape limpa o campo de busca', async ({ page }) => {
    await page.goto('/mercado')

    const searchInput = page.getByTestId('market-search-input')
    await searchInput.fill('Flamengo')
    await expect(searchInput).toHaveValue('Flamengo')

    // Escape deve limpar
    await searchInput.press('Escape')
    await expect(searchInput).toHaveValue('')

    // Botão X não deve estar visível após limpar
    await expect(page.getByTestId('market-search-clear')).not.toBeVisible()
  })

  // ── A11Y-05: aria-pressed correto nos filtros de divisão ─────────────────
  test('A11Y-05: aria-pressed reflete seleção correta nos filtros de divisão', async ({ page }) => {
    await page.goto('/mercado')
    await page.waitForSelector('[data-testid="filter-btn-all"]', { timeout: 10_000 })

    // Estado inicial: "Todos" deve ter aria-pressed=true
    const allFilter = page.getByTestId('filter-btn-all')
    await expect(allFilter).toHaveAttribute('aria-pressed', 'true')

    const serieAFilter = page.getByTestId('filter-btn-series-a')
    await expect(serieAFilter).toHaveAttribute('aria-pressed', 'false')

    // Clica em Série A
    await serieAFilter.click()
    await expect(serieAFilter).toHaveAttribute('aria-pressed', 'true')
    await expect(allFilter).toHaveAttribute('aria-pressed', 'false')

    // Clica de volta em Todos
    await allFilter.click()
    await expect(allFilter).toHaveAttribute('aria-pressed', 'true')
    await expect(serieAFilter).toHaveAttribute('aria-pressed', 'false')
  })

  // ── A11Y-06: CLS < 0.05 durante carregamento da página ───────────────────
  test('A11Y-06: CLS < 0.05 durante carregamento da página', async ({ page }) => {
    // Interceptar CLS via PerformanceObserver
    let cumulativeLayoutShift = 0

    await page.addInitScript(() => {
      window.__clsValue = 0
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // @ts-expect-error — layout-shift entries have hadRecentInput (non-standard PerformanceEntry field)
          if (!entry.hadRecentInput) {
            // @ts-expect-error — entry.value exists on layout-shift PerformanceEntry
            window.__clsValue += entry.value
          }
        }
      })
      observer.observe({ type: 'layout-shift', buffered: true })
    })

    await page.goto('/mercado')
    await page.waitForSelector('[data-testid="market-search-input"]', { timeout: 10_000 })

    // Aguarda estabilização
    await page.waitForTimeout(2_000)

    cumulativeLayoutShift = await page.evaluate(() => (window as { __clsValue?: number }).__clsValue ?? 0)

    expect(cumulativeLayoutShift).toBeLessThan(0.05)
  })
})
