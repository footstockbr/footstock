# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier1-circuit-breaker.spec.ts >> T-004: Circuit Breaker — TIER 1 >> CB-01: Admin pode ativar halt em ativo especifico via API
- Location: tests/e2e/tier1-circuit-breaker.spec.ts:32:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  1   | /**
  2   |  * TIER 1 — Circuit Breaker (T-004)
  3   |  * Foot Stock / T-033 Verificacao E2E Completa de Gaps
  4   |  *
  5   |  * Cenarios cobertos:
  6   |  *   CB-01: Admin ativa halt em ativo especifico via API
  7   |  *   CB-02: Ordens bloqueadas durante halt retornam erro especifico
  8   |  *   CB-03: Banner "Negociacao suspensa" visivel no frontend durante halt
  9   |  *   CB-04: Admin acessa HaltControl no painel motor
  10  |  *   CB-05: Admin libera halt — ordens voltam a funcionar
  11  |  *   CB-06: Badge de halt visivel no asset-card do ativo suspenso
  12  |  *   CB-07: Global halt bloqueia todas as ordens
  13  |  *
  14  |  * Obvios nao ditos:
  15  |  *   - Badge de halt deve ter countdown exibindo tempo restante (se TTL configurado)
  16  |  *   - Halt deve persistir entre requests (nao e apenas in-memory efemero)
  17  |  *   - Notificacao deve ser enviada aos usuarios apos halt ativado/liberado
  18  |  *   - Halt de ativo especifico nao deve afetar outros ativos
  19  |  *   - Admin deve ver log de audit do halt (quem ativou, quando)
  20  |  */
  21  | 
  22  | import { test, expect } from '@playwright/test'
  23  | import { loginAs, USERS, TEST_TICKER, expectNoServerError, releaseAllHalts } from './setup'
  24  | 
  25  | test.describe('T-004: Circuit Breaker — TIER 1', () => {
  26  |   test.afterEach(async ({ request }) => {
  27  |     // Garantir que o halt e liberado apos cada teste
  28  |     await releaseAllHalts(request)
  29  |   })
  30  | 
  31  |   // CB-01: Admin ativa halt em ativo especifico
  32  |   test('CB-01: Admin pode ativar halt em ativo especifico via API', async ({ request }) => {
  33  |     const loginRes = await request.post('/api/v1/auth/login', {
  34  |       data: { email: USERS.admin.email, password: USERS.admin.password },
  35  |     })
> 36  |     expect(loginRes.status()).toBe(200)
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  37  | 
  38  |     // Ativar halt no ticker de teste
  39  |     const haltRes = await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
  40  |       data: { reason: 'Teste E2E: circuit breaker' },
  41  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  42  |     })
  43  | 
  44  |     // 200 ou 201 (halt ativado)
  45  |     expect([200, 201]).toContain(haltRes.status())
  46  |     const body = await haltRes.json()
  47  |     expect(body.success).toBe(true)
  48  |   })
  49  | 
  50  |   // CB-02: Ordens bloqueadas durante halt
  51  |   test('CB-02: POST /api/v1/orders bloqueado durante halt — retorna erro HALT especifico', async ({
  52  |     request,
  53  |   }) => {
  54  |     const adminLoginRes = await request.post('/api/v1/auth/login', {
  55  |       data: { email: USERS.admin.email, password: USERS.admin.password },
  56  |     })
  57  | 
  58  |     // Ativar halt
  59  |     await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
  60  |       data: { reason: 'Teste E2E CB-02' },
  61  |       headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
  62  |     })
  63  | 
  64  |     // Tentar criar ordem com usuario normal
  65  |     const userLoginRes = await request.post('/api/v1/auth/login', {
  66  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  67  |     })
  68  | 
  69  |     const orderRes = await request.post('/api/v1/orders', {
  70  |       data: {
  71  |         ticker: TEST_TICKER,
  72  |         side: 'BUY',
  73  |         type: 'MARKET',
  74  |         quantity: 1,
  75  |       },
  76  |       headers: { cookie: userLoginRes.headers()['set-cookie'] ?? '' },
  77  |     })
  78  | 
  79  |     // Deve retornar erro (503 motor offline ou 422 com codigo de halt)
  80  |     expect(orderRes.status()).not.toBe(201)
  81  |     expect(orderRes.status()).not.toBe(500)
  82  | 
  83  |     const body = await orderRes.json()
  84  |     expect(body.success).toBe(false)
  85  |   })
  86  | 
  87  |   // CB-03: Banner de halt no frontend
  88  |   test('CB-03: Banner "Negociacao suspensa" visivel no ativo em halt', async ({
  89  |     page,
  90  |     request,
  91  |   }) => {
  92  |     // Login admin e ativar halt
  93  |     const adminLoginRes = await request.post('/api/v1/auth/login', {
  94  |       data: { email: USERS.admin.email, password: USERS.admin.password },
  95  |     })
  96  |     await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
  97  |       data: { reason: 'Teste E2E CB-03 banner' },
  98  |       headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
  99  |     })
  100 | 
  101 |     // Usuario normal acessa pagina do ativo
  102 |     await loginAs(page, 'craque')
  103 |     await page.goto(`/ativo/${TEST_TICKER}`)
  104 |     await page.waitForLoadState('networkidle')
  105 | 
  106 |     // Banner de halt deve estar visivel
  107 |     const haltBanner = page.locator('[data-testid="halt-banner"]')
  108 |     await expect(haltBanner).toBeVisible({ timeout: 8_000 })
  109 | 
  110 |     await expectNoServerError(page)
  111 |   })
  112 | 
  113 |   // CB-03b: Badge de halt no asset-card do mercado
  114 |   test('CB-03b: Badge "halted" visivel no asset-card durante halt', async ({ page, request }) => {
  115 |     // Ativar halt via API
  116 |     const adminLoginRes = await request.post('/api/v1/auth/login', {
  117 |       data: { email: USERS.admin.email, password: USERS.admin.password },
  118 |     })
  119 |     await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
  120 |       data: { reason: 'Teste E2E badge' },
  121 |       headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
  122 |     })
  123 | 
  124 |     // Verificar badge no mercado
  125 |     await loginAs(page, 'craque')
  126 |     await page.goto('/mercado')
  127 |     await page.waitForLoadState('networkidle')
  128 | 
  129 |     // O badge pode estar no asset-card do ativo especifico
  130 |     const haltedBadge = page.locator('[data-testid="halted-badge"]').first()
  131 |     const assetCardHalt = page.locator('[data-testid="asset-card-halted-badge"]').first()
  132 | 
  133 |     const badgeVisible =
  134 |       (await haltedBadge.isVisible().catch(() => false)) ||
  135 |       (await assetCardHalt.isVisible().catch(() => false))
  136 | 
```