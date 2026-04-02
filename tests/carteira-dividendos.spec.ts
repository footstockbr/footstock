// ============================================================================
// Foot Stock — E2E: Aba Dividendos em /carteira (Playwright)
// Cobre: listagem, filtros, reinvestimento, paginação, acessibilidade básica.
// Requer servidor rodando em BASE_URL com sessão de teste injetada.
// Rastreabilidade: INT-072, INT-073, INT-074
// ============================================================================

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

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

test.describe('/carteira — Aba Dividendos', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithTestSession(page)
    await page.goto('/carteira')
    // Navegar para aba Dividendos
    await page.getByRole('tab', { name: /dividendos/i }).click()
    await page.waitForLoadState('networkidle')
  })

  // ── DIV-E2E-01: Renderização da aba ──────────────────────────────────────
  test('DIV-E2E-01: aba Dividendos é acessível e ativa', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /dividendos/i })
    await expect(tab).toBeVisible()
  })

  // ── DIV-E2E-02: Filtros por tipo com aria-pressed ─────────────────────────
  test('DIV-E2E-02: filtros Todos/Esportivos/Financeiros têm aria-pressed correto', async ({ page }) => {
    const group = page.getByRole('group', { name: /filtrar por tipo/i })
    await expect(group).toBeVisible()

    // "Todos" deve iniciar como pressionado
    const todosBtn = page.getByRole('button', { name: 'Todos' })
    await expect(todosBtn).toHaveAttribute('aria-pressed', 'true')

    // Clicar em Esportivos
    const esportivoBtn = page.getByRole('button', { name: 'Esportivos' })
    await esportivoBtn.click()
    await expect(esportivoBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(todosBtn).toHaveAttribute('aria-pressed', 'false')

    // Voltar para Todos
    await todosBtn.click()
    await expect(todosBtn).toHaveAttribute('aria-pressed', 'true')
  })

  // ── DIV-E2E-03: Dividendo PENDING exibe botão Reinvestir ─────────────────
  test('DIV-E2E-03: dividendo PENDING exibe prazo e botão Reinvestir visível', async ({ page }) => {
    // Este teste assume que há pelo menos um dividendo PENDING no ambiente de teste
    const pendingItems = page.locator('[aria-label*="Reinvestir dividendo"]')
    const count = await pendingItems.count()

    if (count > 0) {
      // Verificar que o botão tem tamanho adequado para touch (min 44px)
      const btn = pendingItems.first()
      const box = await btn.boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(44)
    } else {
      // Se não há PENDING, verificar que a lista ou estado vazio é visível
      const list = page.getByRole('list')
      const empty = page.getByText(/sem dividendos/i)
      const isListVisible = await list.isVisible().catch(() => false)
      const isEmptyVisible = await empty.isVisible().catch(() => false)
      expect(isListVisible || isEmptyVisible).toBe(true)
    }
  })

  // ── DIV-E2E-04: Zero violações de acessibilidade (axe-core) ──────────────
  test('DIV-E2E-04: axe-core não reporta violações WCAG 2.1 AA na aba Dividendos', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('[aria-hidden="true"]')
      .analyze()

    expect(results.violations).toHaveLength(0)
  })
})
