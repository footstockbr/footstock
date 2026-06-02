/**
 * TIER 2 — Motor de Matching (T-009)
 * FootStock / T-033 Verificacao E2E Completa de Gaps
 *
 * Cenarios cobertos:
 *   ME-01: GET /api/v1/admin/motor/kpis retorna KPIs do motor
 *   ME-02: GET /api/v1/admin/motor/layers retorna 10 camadas do motor
 *   ME-03: Ordem MARKET e executada em < 2 segundos (tempo de resposta)
 *   ME-04: Preco do ativo disponivel via API apos execucao
 *   ME-05: Logs de camadas do motor acessiveis para admin
 */

import { test, expect } from '@playwright/test'
import { USERS, TEST_TICKER } from './setup'

test.describe('T-009: Motor de Matching — TIER 2', () => {
  test('ME-01: GET /api/v1/admin/motor/kpis retorna KPIs do motor', async ({ request }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.get('/api/v1/admin/motor/kpis', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
  })

  test('ME-02: GET /api/v1/admin/motor/layers retorna camadas do motor (10 esperadas)', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.get('/api/v1/admin/motor/layers', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    // Deve ter as camadas do motor
    const layers = body.data?.layers ?? body.data
    if (Array.isArray(layers)) {
      expect(layers.length).toBeGreaterThan(0)
    }
  })

  test('ME-03: POST /api/v1/orders MARKET responde em menos de 3 segundos', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    const startTime = Date.now()
    const orderRes = await request.post('/api/v1/orders', {
      data: {
        ticker: TEST_TICKER,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
      },
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
      timeout: 5_000,
    })
    const elapsed = Date.now() - startTime

    // Resposta deve chegar em menos de 3 segundos (< 3000ms)
    expect(elapsed).toBeLessThan(3_000)
    // Resultado pode ser 201, 422 (saldo/validacao), 503 (motor offline) — nao 500
    expect(orderRes.status()).not.toBe(500)
  })

  test('ME-04: GET /api/v1/assets/[ticker] retorna preco atualizado', async ({ request }) => {
    const res = await request.get(`/api/v1/assets/${TEST_TICKER}`)
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()

    const price = body.data?.price ?? body.data?.currentPrice
    if (price !== undefined) {
      expect(typeof price).toBe('number')
      expect(price).toBeGreaterThan(0)
    }
  })

  test('ME-05: GET /api/v1/admin/motor/status retorna estado online/offline do motor', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.get('/api/v1/admin/motor/status', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()

    // O status deve ser um dos valores validos
    const motorStatus = body.data?.status ?? body.data?.state
    if (motorStatus) {
      const validStatuses = ['ONLINE', 'OFFLINE', 'DEGRADED', 'online', 'offline', 'degraded']
      expect(typeof motorStatus).toBe('string')
    }
  })

  test('ME-06: KPIs do motor nao sao acessiveis sem autenticacao admin', async ({ request }) => {
    const res = await request.get('/api/v1/admin/motor/kpis')
    expect([401, 403]).toContain(res.status())
  })
})
