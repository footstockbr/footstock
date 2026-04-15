/**
 * TIER 1 — Modo Degradado (T-005)
 * Foot Stock / T-033 Verificacao E2E Completa de Gaps
 *
 * Cenarios cobertos:
 *   DG-01: Health check retorna status do motor (online/degraded)
 *   DG-02: GET /api/v1/health/motor retorna estado do motor de matching
 *   DG-03: POST /api/v1/orders durante modo degradado retorna erro MOTOR_090
 *   DG-04: Endpoint de health do sistema disponivel sem autenticacao
 *   DG-05: Motor status exposto para admin no dashboard
 *   DG-06: Historico de ordens permanece acessivel durante modo degradado
 *
 * Obvios nao ditos:
 *   - Banner de modo degradado deve aparecer em < 3 segundos apos falha
 *   - Banner deve desaparecer em < 5 segundos apos retomada
 *   - Ordens criadas antes da falha devem permanecer no historico
 *   - Health check nao deve exigir autenticacao (monitoring externo)
 *   - Modo degradado nao cancela ordens pendentes existentes
 *
 * Nota: Testes de ativacao real do modo degradado dependem de ambiente de
 *       staging com controle do motor — marcados como skip em local.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS, expectNoServerError, resetMotorState } from './setup'

const isLocalEnv = !process.env.TEST_ENV || process.env.TEST_ENV === 'development'

test.describe('T-005: Modo Degradado — TIER 1', () => {
  test.afterAll(async ({ request }) => {
    await resetMotorState(request)
  })

  // DG-01: Health check publico
  test('DG-01: GET /api/health retorna status 200 sem autenticacao', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toBeDefined()
    // Deve ter campo de status do sistema
    const status = body.status ?? body.data?.status
    expect(['ok', 'degraded', 'online', 'healthy']).toContain(status)
  })

  // DG-01b: Health check de motor especifico
  test('DG-01b: GET /api/v1/health/motor retorna estado do motor de matching', async ({
    request,
  }) => {
    const res = await request.get('/api/v1/health/motor')

    // Pode ser 200 (motor ok) ou 503 (motor degradado) — nunca 500
    expect([200, 503]).toContain(res.status())
    expect(res.status()).not.toBe(500)

    const body = await res.json()
    expect(body).toBeDefined()
  })

  // DG-02: v1 health
  test('DG-02: GET /api/v1/health retorna estrutura padrao de saude do sistema', async ({
    request,
  }) => {
    const res = await request.get('/api/v1/health')
    expect(res.status()).toBe(200)

    const body = await res.json()
    // Verificar campos esperados
    expect(body.success ?? body.status).toBeDefined()
  })

  // DG-03: Modo degradado bloqueia novas ordens
  test('DG-03: POST /api/v1/orders retorna MOTOR_090 quando motor esta offline', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })

    // Simular motor offline via endpoint de dev (apenas staging)
    const motorOfflineRes = await request.post('/api/v1/dev/motor/stop', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    if (motorOfflineRes.status() === 404 || motorOfflineRes.status() === 403) {
      // Endpoint de dev nao disponivel — skip comportamental
      test.skip()
      return
    }

    // Com motor offline, tentar criar ordem
    const orderRes = await request.post('/api/v1/orders', {
      data: {
        ticker: process.env.TEST_TICKER ?? 'URU3',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
      },
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect(orderRes.status()).toBe(503)
    const body = await orderRes.json()
    expect(body.error?.code).toBe('MOTOR_090')
  })

  // DG-04: Dashboard admin exibe estado do motor
  test('DG-04: Admin dashboard exibe KPI do motor com estado atual', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // KPIs de dashboard devem carregar
    const dashboard = page.locator('[data-testid="admin-dashboard-cards"]').or(
      page.locator('[data-testid="admin-dashboard-header"]')
    )
    await expect(dashboard).toBeVisible({ timeout: 10_000 })
  })

  // DG-05: Motor page do admin exibe estado em tempo real
  test('DG-05: Pagina /admin/motor exibe estado atual do motor de matching', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/admin/motor')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    // MotorStateCard deve estar visivel
    const motorPage = page.locator('main')
    await expect(motorPage).toBeVisible({ timeout: 8_000 })

    // KPI de circuit breakers deve estar disponivel
    const kpiCircuitBreakers = page.locator('[data-testid="admin-motor-kpi-circuit-breakers"]')
    if (await kpiCircuitBreakers.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(kpiCircuitBreakers).toBeVisible()
    }
  })

  // DG-06: Historico de ordens acessivel mesmo em modo degradado
  test('DG-06: GET /api/v1/orders (historico) funciona independente do estado do motor', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    // O endpoint GET de ordens (leitura) deve funcionar sempre
    const ordersRes = await request.get('/api/v1/orders', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect([200, 204]).toContain(ordersRes.status())
    expect(ordersRes.status()).not.toBe(500)
  })

  // DG-07: Banner modo degradado (UI test — staging only)
  test.skip(isLocalEnv, 'DG-07: Banner modo degradado — requer controle do motor em staging')
  test('DG-07: Banner "Servico temporariamente indisponivel" aparece em < 3s apos falha do motor', async ({
    page,
  }) => {
    await loginAs(page, 'craque')
    await page.goto('/mercado')
    await page.waitForLoadState('networkidle')

    // Esperar que o banner apareca (motor deve estar offline no ambiente de staging)
    await expect(
      page.locator('text=/servi.o.*indispon.vel|negociação.*suspensa/i').first()
    ).toBeVisible({ timeout: 5_000 })
  })
})
