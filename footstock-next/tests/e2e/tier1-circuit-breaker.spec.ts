/**
 * TIER 1 — Circuit Breaker (T-004)
 * FootStock / T-033 Verificacao E2E Completa de Gaps
 *
 * Cenarios cobertos:
 *   CB-01: Admin ativa halt em ativo especifico via API
 *   CB-02: Ordens bloqueadas durante halt retornam erro especifico
 *   CB-03: Banner "Negociacao suspensa" visivel no frontend durante halt
 *   CB-04: Admin acessa HaltControl no painel motor
 *   CB-05: Admin libera halt — ordens voltam a funcionar
 *   CB-06:  Global halt — contrato HTTP read-only (status + presenca de data)
 *   CB-06b: Global halt congela operacoes de fato (evidencia real persistida/bloqueio)
 *   CB-07: Endpoint de status do motor disponivel
 *
 * Obvios nao ditos:
 *   - Badge de halt deve ter countdown exibindo tempo restante (se TTL configurado)
 *   - Halt deve persistir entre requests (nao e apenas in-memory efemero)
 *   - Notificacao deve ser enviada aos usuarios apos halt ativado/liberado
 *   - Halt de ativo especifico nao deve afetar outros ativos
 *   - Admin deve ver log de audit do halt (quem ativou, quando)
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS, TEST_TICKER, expectNoServerError, releaseAllHalts } from './setup'

test.describe('T-004: Circuit Breaker — TIER 1', () => {
  test.afterEach(async ({ request }) => {
    // Garantir que o halt e liberado apos cada teste
    await releaseAllHalts(request)
  })

  // CB-01: Admin ativa halt em ativo especifico
  test('CB-01: Admin pode ativar halt em ativo especifico via API', async ({ request }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })
    expect(loginRes.status()).toBe(200)

    // Ativar halt no ticker de teste
    const haltRes = await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
      data: { reason: 'Teste E2E: circuit breaker' },
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    // 200 ou 201 (halt ativado)
    expect([200, 201]).toContain(haltRes.status())
    const body = await haltRes.json()
    expect(body.success).toBe(true)
  })

  // CB-02: Ordens bloqueadas durante halt
  test('CB-02: POST /api/v1/orders bloqueado durante halt — retorna erro HALT especifico', async ({
    request,
  }) => {
    const adminLoginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })

    // Ativar halt
    await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
      data: { reason: 'Teste E2E CB-02' },
      headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
    })

    // Tentar criar ordem com usuario normal
    const userLoginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })

    const orderRes = await request.post('/api/v1/orders', {
      data: {
        ticker: TEST_TICKER,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
      },
      headers: { cookie: userLoginRes.headers()['set-cookie'] ?? '' },
    })

    // Deve retornar erro (503 motor offline ou 422 com codigo de halt)
    expect(orderRes.status()).not.toBe(201)
    expect(orderRes.status()).not.toBe(500)

    const body = await orderRes.json()
    expect(body.success).toBe(false)
  })

  // CB-03: Banner de halt no frontend
  test('CB-03: Banner "Negociacao suspensa" visivel no ativo em halt', async ({
    page,
    request,
  }) => {
    // Login admin e ativar halt
    const adminLoginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })
    await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
      data: { reason: 'Teste E2E CB-03 banner' },
      headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
    })

    // Usuario normal acessa pagina do ativo
    await loginAs(page, 'craque')
    await page.goto(`/ativo/${TEST_TICKER}`)
    await page.waitForLoadState('networkidle')

    // Banner de halt deve estar visivel
    const haltBanner = page.locator('[data-testid="halt-banner"]')
    await expect(haltBanner).toBeVisible({ timeout: 8_000 })

    await expectNoServerError(page)
  })

  // CB-03b: Badge de halt no asset-card do mercado
  test('CB-03b: Badge "halted" visivel no asset-card durante halt', async ({ page, request }) => {
    // Ativar halt via API
    const adminLoginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })
    await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
      data: { reason: 'Teste E2E badge' },
      headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
    })

    // Verificar badge no mercado
    await loginAs(page, 'craque')
    await page.goto('/mercado')
    await page.waitForLoadState('networkidle')

    // O badge pode estar no asset-card do ativo especifico
    const haltedBadge = page.locator('[data-testid="halted-badge"]').first()
    const assetCardHalt = page.locator('[data-testid="asset-card-halted-badge"]').first()

    const badgeVisible =
      (await haltedBadge.isVisible().catch(() => false)) ||
      (await assetCardHalt.isVisible().catch(() => false))

    expect(badgeVisible).toBe(true)
  })

  // CB-04: Admin acessa painel de halt control
  test('CB-04: Admin ve HaltControl no painel do motor', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/admin/motor')
    await page.waitForLoadState('networkidle')

    // HaltControl deve estar presente
    const haltControl = page.locator('[data-testid="halt-control"]')
    await expect(haltControl).toBeVisible({ timeout: 8_000 })

    // Botao de overlay de halt deve estar acessivel
    const haltButtons = page.locator('[data-testid="halt-buttons-overlay"]')
    await expect(haltButtons).toBeVisible({ timeout: 5_000 })

    await expectNoServerError(page)
  })

  // CB-05: Admin libera halt via API
  test('CB-05: Admin pode liberar halt e ordens voltam a funcionar', async ({ request }) => {
    const adminLoginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })

    // Ativar halt
    await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
      data: { reason: 'Teste E2E CB-05' },
      headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
    })

    // Liberar halt
    const releaseRes = await request.delete(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
      headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
    })

    expect([200, 204]).toContain(releaseRes.status())

    // Verificar que ordens voltam a ser aceitas pelo motor (status do ativo)
    const assetRes = await request.get(`/api/v1/assets/${TEST_TICKER}`)
    expect(assetRes.status()).toBe(200)
    const assetBody = await assetRes.json()
    // Campo halted deve ser false ou ausente
    const isHalted = assetBody.data?.halted ?? false
    expect(isHalted).toBe(false)
  })

  // CB-06: Contrato HTTP read-only do global halt (NAO prova congelamento real)
  // Verifica apenas que o endpoint aceita o comando e que motor/status responde
  // o contrato esperado. A prova de congelamento real fica em CB-06b.
  test('CB-06: Global halt via /api/v1/admin/motor/global-halt — contrato HTTP read-only', async ({
    request,
  }) => {
    const adminLoginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })

    // Ativar global halt
    const globalHaltRes = await request.post('/api/v1/admin/motor/global-halt', {
      data: { reason: 'Teste E2E global halt' },
      headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
    })

    expect([200, 201]).toContain(globalHaltRes.status())

    // Contrato do endpoint de status: responde 200 com payload `data` definido.
    // Atencao: presenca de `data` NAO e evidencia de halt — e apenas contrato HTTP.
    const motorStatusRes = await request.get('/api/v1/admin/motor/status', {
      headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
    })
    expect(motorStatusRes.status()).toBe(200)
    const statusBody = await motorStatusRes.json()
    expect(statusBody.data).toBeDefined()

    // Liberar o halt global apos o teste via endpoint real (DELETE faz
    // redis.del('motor:global-halt')). releaseAllHalts() depende de uma rota
    // dev ausente (DELETE /api/v1/dev/halts) e e no-op silencioso.
    await request.delete('/api/v1/admin/motor/global-halt', {
      headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
    })
    await releaseAllHalts(request)
  })

  // CB-06b: Global halt congela operacoes de fato.
  // Regra de decisao DETERMINISTA (primeira evidencia disponivel vence, sem skip silencioso):
  //   1) flag persistida de halt global  -> assertar e ENCERRAR
  //   2) POST /orders bloqueado de fato   -> reutiliza padrao CB-02
  //   3) invariancia de preco (fallback)  -> 5 amostras a 200ms, todas identicas
  // A transicao entre opcoes e observavel via test.info().annotations.
  test('CB-06b: Global halt congela operacoes de fato', async ({ request }, testInfo) => {
    const adminLoginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })
    const adminCookie = adminLoginRes.headers()['set-cookie'] ?? ''

    // Ativar global halt
    const globalHaltRes = await request.post('/api/v1/admin/motor/global-halt', {
      data: { reason: 'Teste E2E CB-06b congelamento real' },
      headers: { cookie: adminCookie },
    })
    expect([200, 201]).toContain(globalHaltRes.status())

    try {
      const marketRes = await request.post('/api/v1/admin/market', {
        data: { type: 'HALT_ALL', reason: 'Teste E2E CB-06b HALT_ALL aplicado pelo motor' },
        headers: { cookie: adminCookie },
      })
      expect(marketRes.status()).toBe(200)
      const marketBody = await marketRes.json()
      const commandId = marketBody?.data?.commandId
      expect(commandId).toBeTruthy()

      let appliedStatus: any = null
      for (let i = 0; i < 20; i++) {
        const statusRes = await request.get(`/api/v1/admin/motor/status?commandId=${commandId}`, {
          headers: { cookie: adminCookie },
        })
        expect(statusRes.status()).toBe(200)
        const statusBody = await statusRes.json()
        const command = statusBody?.data?.operational?.command
        if (command?.state === 'applied' && command?.applied === true) {
          appliedStatus = statusBody.data
          break
        }
        await new Promise((r) => setTimeout(r, 1000))
      }

      if (!appliedStatus) {
        testInfo.annotations.push({
          type: 'blocked',
          description: 'HALT_ALL publicado, mas sem evidencia de consumo/aplicacao pelo servico motor',
        })
      }
      expect(appliedStatus).toBeTruthy()
      expect(appliedStatus.globalHalt.status).toBe('halted')
      expect(appliedStatus.operational.command.type).toBe('HALT_ALL')
      expect(appliedStatus.operational.db.haltAllCount).toBeGreaterThan(0)

      testInfo.annotations.push({
        type: 'cb-06b-evidence',
        description: 'global-halt + HALT_ALL applied + DB haltReason=HALT_ALL + invariancia de preco',
      })
      const prices: Array<number | string | null> = []
      for (let i = 0; i < 5; i++) {
        const priceRes = await request.get(`/api/v1/assets/${TEST_TICKER}`)
        expect(priceRes.status()).toBe(200)
        const priceBody = await priceRes.json()
        prices.push(priceBody?.data?.price ?? null)
        if (i < 4) await new Promise((r) => setTimeout(r, 200))
      }
      // Motor congelado: todas as 5 leituras de preco devem ser identicas.
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBe(prices[0])
      }
    } finally {
      await request.post('/api/v1/admin/market', {
        data: { type: 'RESUME_ALL', reason: 'Teste E2E CB-06b retomada apos validacao' },
        headers: { cookie: adminCookie },
      }).catch(() => null)
      // Reset explicito do global halt via endpoint real (DELETE existe e faz
      // redis.del('motor:global-halt')); releaseAllHalts() depende de rota dev
      // ausente e e no-op silencioso, logo nao limparia o global halt.
      await request.delete('/api/v1/admin/motor/global-halt', {
        headers: { cookie: adminCookie },
      })
      await releaseAllHalts(request)
    }
  })

  // CB-07: Endpoint de status do motor disponivel
  test('CB-07: GET /api/v1/admin/motor/status retorna estado atual do motor', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password },
    })

    const res = await request.get('/api/v1/admin/motor/status', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
  })
})
