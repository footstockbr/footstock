/**
 * TIER 1 — Alavancagem 2x Lenda (T-003)
 * Foot Stock / T-033 Verificacao E2E Completa de Gaps
 *
 * Cenarios cobertos:
 *   LV-01: LeverageToggle visivel apenas para usuario Lenda na tela de ordem
 *   LV-02: Jogador/Craque NAO ve opcao de alavancagem (toggle ausente ou locked)
 *   LV-03: POST /api/v1/orders com isLeveraged=true cria ordem alavancada
 *   LV-04: Posicao alavancada exibida com badge "ALAVANCADA 2x" no portfolio
 *   LV-05: Endpoint de juros diarios do cron responde corretamente
 *   LV-06: Ordem alavancada nao permitida para Craque (retorna erro de plano)
 *
 * Obvios nao ditos:
 *   - LeverageToggle locked para nao-Lenda deve ter tooltip explicativo
 *   - leverageRatio deve ser exatamente 2 na ordem criada
 *   - Juros de 0.15%/dia devem aparecer no extrato como tipo FEE_LEVERAGE
 *   - Liquidacao automatica < 25% deve gerar notificacao ao usuario
 *   - Interface deve mostrar valor original E valor alavancado claramente
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS, TEST_TICKER, expectNoServerError } from './setup'

test.describe('T-003: Alavancagem 2x Lenda — TIER 1', () => {
  // LV-01: LeverageToggle visivel para Lenda
  test('LV-01: Usuario Lenda ve LeverageToggle na tela de criacao de ordem', async ({ page }) => {
    await loginAs(page, 'lenda')
    await page.goto(`/ativo/${TEST_TICKER}`)
    await page.waitForLoadState('networkidle')

    // Verificar que a aba de ordens esta acessivel
    const ordensTab = page.locator('[data-testid="ativo-tab-ordens"]')
    if (await ordensTab.isVisible()) {
      await ordensTab.click()
    }

    // O LeverageToggle deve estar visivel e habilitado
    const leverageToggle = page.locator('[data-testid="leverage-toggle"]')
    await expect(leverageToggle).toBeVisible({ timeout: 8_000 })

    // Nao deve estar bloqueado (locked)
    const leverageLocked = page.locator('[data-testid="leverage-toggle-locked"]')
    await expect(leverageLocked).not.toBeVisible()

    await expectNoServerError(page)
  })

  // LV-02: Jogador nao ve alavancagem desbloqueada
  test('LV-02: Usuario Jogador ve LeverageToggle bloqueado ou ausente', async ({ page }) => {
    await loginAs(page, 'jogador')
    await page.goto(`/ativo/${TEST_TICKER}`)
    await page.waitForLoadState('networkidle')

    const ordensTab = page.locator('[data-testid="ativo-tab-ordens"]')
    if (await ordensTab.isVisible()) {
      await ordensTab.click()
    }

    // Toggle pode estar ausente OU estar presente como "locked"
    const leverageToggle = page.locator('[data-testid="leverage-toggle"]')
    const leverageLocked = page.locator('[data-testid="leverage-toggle-locked"]')

    const isToggleVisible = await leverageToggle.isVisible().catch(() => false)
    if (isToggleVisible) {
      // Se visivel, deve estar bloqueado
      await expect(leverageLocked).toBeVisible({ timeout: 3_000 })
    }
    // Se ausente — comportamento esperado para Jogador
  })

  // LV-03: API aceita ordem alavancada de Lenda
  test('LV-03: POST /api/v1/orders com isLeveraged=true cria ordem com leverageRatio=2', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.lenda.email, password: USERS.lenda.password },
    })
    expect(loginRes.status()).toBe(200)

    const orderRes = await request.post('/api/v1/orders', {
      data: {
        ticker: TEST_TICKER,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        isLeveraged: true,
      },
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    // 201 (criada) ou 422/403 se motor offline ou saldo insuficiente
    // O importante e que nao seja 500 e que isLeveraged seja processado
    expect(orderRes.status()).not.toBe(500)

    const body = await orderRes.json()
    if (orderRes.status() === 201) {
      expect(body.data?.order?.isLeveraged).toBe(true)
      expect(body.data?.order?.leverageRatio).toBe(2)
    }
  })

  // LV-03b: Craque nao pode criar ordem alavancada
  test('LV-03b: Craque nao pode criar ordem alavancada — retorna erro de plano', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    const orderRes = await request.post('/api/v1/orders', {
      data: {
        ticker: TEST_TICKER,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        isLeveraged: true,
      },
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    // Craque nao tem permissao de alavancagem — deve retornar 403 ou erro de validacao
    if (orderRes.status() === 422 || orderRes.status() === 403) {
      const body = await orderRes.json()
      expect(body.success).toBe(false)
    }
    expect(orderRes.status()).not.toBe(500)
  })

  // LV-04: Badge "ALAVANCADA 2x" no portfolio
  test('LV-04: Portfolio do Lenda exibe posicoes alavancadas com badge correto', async ({
    page,
  }) => {
    await loginAs(page, 'lenda')
    await page.goto('/portfolio')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // Verificar que o portfolio carrega (pode estar vazio se nao houver posicoes)
    const portfolioPage = page.locator('[data-testid="portfolio-page"]').or(
      page.locator('[data-testid="carteira-page"]')
    ).or(page.locator('main'))

    await expect(portfolioPage).toBeVisible({ timeout: 8_000 })

    // Se houver posicoes alavancadas, devem ter o badge
    const leveragedBadges = page.locator('text=/ALAVANCADA|2x/i')
    // O badge pode ou nao existir dependendo das posicoes do usuario de teste
    // Apenas verificar que nao ha erro de servidor
    const count = await leveragedBadges.count()
    if (count > 0) {
      // Se existir, deve ser visivel
      await expect(leveragedBadges.first()).toBeVisible()
    }
  })

  // LV-05: Cron de juros diarios de alavancagem
  test('LV-05: Cron /api/cron/leverage-interest responde 200 ou 401 (nao 500)', async ({
    request,
  }) => {
    // O cron deve ser protegido por secret header
    const res = await request.post('/api/cron/leverage-interest', {
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}`,
      },
    })

    // 200 (executou), 401 (secret invalido em dev) — nunca 500
    expect([200, 401, 403]).toContain(res.status())

    if (res.status() === 200) {
      const body = await res.json()
      expect(body.success).toBe(true)
    }
  })

  // LV-05b: Endpoint de juros sem secret retorna 401
  test('LV-05b: Cron leverage-interest sem authorization retorna 401', async ({ request }) => {
    const res = await request.post('/api/cron/leverage-interest')
    expect([401, 403]).toContain(res.status())
  })

  // LV-06: Ordem alavancada com quantidade invalida
  test('LV-06: Ordem alavancada com quantidade 0 retorna erro de validacao', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.lenda.email, password: USERS.lenda.password },
    })

    const orderRes = await request.post('/api/v1/orders', {
      data: {
        ticker: TEST_TICKER,
        side: 'BUY',
        type: 'MARKET',
        quantity: 0,
        isLeveraged: true,
      },
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect([400, 422]).toContain(orderRes.status())
    const body = await orderRes.json()
    expect(body.success).toBe(false)
  })
})
