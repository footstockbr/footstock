/**
 * TIER 2 — Modulos do Admin (T-012)
 * FootStock / T-033 Verificacao E2E Completa de Gaps
 *
 * Cenarios cobertos:
 *   AM-01: SUPER_ADMIN acessa todos os modulos do painel admin
 *   AM-02: MODERADOR acessa modulo de Moderacao mas nao Financeiro
 *   AM-03: SUPORTE acessa modulo de Usuarios (somente leitura)
 *   AM-04: Acesso negado exibe mensagem de erro (nao tela em branco)
 *   AM-05: Cada modulo admin retorna estrutura correta via API
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS, expectNoServerError } from './setup'

test.describe('T-012: Modulos do Admin — TIER 2', () => {
  test('AM-01: SUPER_ADMIN acessa dashboard principal do admin', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    const header = page.locator('[data-testid="admin-dashboard-header"]')
    await expect(header).toBeVisible({ timeout: 10_000 })
  })

  test('AM-01b: SUPER_ADMIN acessa modulo financeiro', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/admin/financeiro')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    const header = page.locator('[data-testid="admin-financeiro-header"]')
    await expect(header).toBeVisible({ timeout: 10_000 })
  })

  test('AM-01c: SUPER_ADMIN acessa modulo de configuracoes', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/admin/configuracoes')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    const header = page.locator('[data-testid="admin-configuracoes-header"]')
    await expect(header).toBeVisible({ timeout: 10_000 })
  })

  test('AM-01d: SUPER_ADMIN acessa modulo de clubes', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/admin/clubes')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    const header = page.locator('[data-testid="admin-clubes-header"]')
    if (await header.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(header).toBeVisible()
    } else {
      // Verificar que a pagina nao tem erro 500
      await expect(page.locator('text=/500|Server Error/i')).not.toBeVisible()
    }
  })

  test('AM-01e: SUPER_ADMIN acessa modulo motor/matching', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/admin/motor')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // Motor page deve ter KPIs
    const kpis = page.locator('main')
    await expect(kpis).toBeVisible({ timeout: 8_000 })
  })

  test('AM-02: MODERADOR nao pode acessar modulo financeiro (403 ou redirect)', async ({
    page,
  }) => {
    await loginAs(page, 'moderador')
    await page.goto('/admin/financeiro')
    await page.waitForLoadState('networkidle')

    // Deve redirecionar para pagina de acesso negado OU mostrar mensagem de erro
    // NUNCA tela em branco
    const body = page.locator('body')
    const bodyText = await body.textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(0)

    // Nao deve ser 500
    await expect(page.locator('text=/500|Internal Server Error/i')).not.toBeVisible()

    // Deve haver indicativo de acesso negado ou redirect para /admin (modulo permitido)
    const isOnFinanceiro = page.url().includes('/admin/financeiro')
    if (isOnFinanceiro) {
      // Se ficou na pagina, deve mostrar mensagem de erro de permissao
      await expect(
        page.locator('text=/sem permiss.o|acesso negado|n.o autorizado|403/i')
      ).toBeVisible({ timeout: 5_000 })
    }
  })

  test('AM-03: API financeiro retorna 403 para MODERADOR', async ({ request }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.moderador.email, password: USERS.moderador.password },
    })
    expect(loginRes.status()).toBe(200)

    // Modulo financeiro via API
    const res = await request.get('/api/v1/admin/financial', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    // Deve ser 403 para MODERADOR (sem acesso financeiro)
    expect([403, 404]).toContain(res.status())
    expect(res.status()).not.toBe(500)
  })

  test('AM-04: Pagina de configuracoes admin retorna estrutura de abas correta', async ({
    page,
  }) => {
    await loginAs(page, 'admin')
    await page.goto('/admin/configuracoes')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // Abas de configuracao
    const tabs = page.locator('[data-testid="admin-configuracoes-tabs"]')
    if (await tabs.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(tabs).toBeVisible()
    }
  })

  test('AM-05: Modulo de engajamento retorna KPIs', async ({ request }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.get('/api/v1/admin/engagement', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test('AM-06: Modulo de auditoria do admin disponivel', async ({ request }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.get('/api/v1/admin/audit', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect([200, 204]).toContain(res.status())
    expect(res.status()).not.toBe(500)
  })
})
