# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier1-leverage.spec.ts >> T-003: Alavancagem 2x Lenda — TIER 1 >> LV-03: POST /api/v1/orders com isLeveraged=true cria ordem com leverageRatio=2
- Location: tests/e2e/tier1-leverage.spec.ts:72:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  1   | /**
  2   |  * TIER 1 — Alavancagem 2x Lenda (T-003)
  3   |  * Foot Stock / T-033 Verificacao E2E Completa de Gaps
  4   |  *
  5   |  * Cenarios cobertos:
  6   |  *   LV-01: LeverageToggle visivel apenas para usuario Lenda na tela de ordem
  7   |  *   LV-02: Jogador/Craque NAO ve opcao de alavancagem (toggle ausente ou locked)
  8   |  *   LV-03: POST /api/v1/orders com isLeveraged=true cria ordem alavancada
  9   |  *   LV-04: Posicao alavancada exibida com badge "ALAVANCADA 2x" no portfolio
  10  |  *   LV-05: Endpoint de juros diarios do cron responde corretamente
  11  |  *   LV-06: Ordem alavancada nao permitida para Craque (retorna erro de plano)
  12  |  *
  13  |  * Obvios nao ditos:
  14  |  *   - LeverageToggle locked para nao-Lenda deve ter tooltip explicativo
  15  |  *   - leverageRatio deve ser exatamente 2 na ordem criada
  16  |  *   - Juros de 0.15%/dia devem aparecer no extrato como tipo FEE_LEVERAGE
  17  |  *   - Liquidacao automatica < 25% deve gerar notificacao ao usuario
  18  |  *   - Interface deve mostrar valor original E valor alavancado claramente
  19  |  */
  20  | 
  21  | import { test, expect } from '@playwright/test'
  22  | import { loginAs, USERS, TEST_TICKER, expectNoServerError } from './setup'
  23  | 
  24  | test.describe('T-003: Alavancagem 2x Lenda — TIER 1', () => {
  25  |   // LV-01: LeverageToggle visivel para Lenda
  26  |   test('LV-01: Usuario Lenda ve LeverageToggle na tela de criacao de ordem', async ({ page }) => {
  27  |     await loginAs(page, 'lenda')
  28  |     await page.goto(`/ativo/${TEST_TICKER}`)
  29  |     await page.waitForLoadState('networkidle')
  30  | 
  31  |     // Verificar que a aba de ordens esta acessivel
  32  |     const ordensTab = page.locator('[data-testid="ativo-tab-ordens"]')
  33  |     if (await ordensTab.isVisible()) {
  34  |       await ordensTab.click()
  35  |     }
  36  | 
  37  |     // O LeverageToggle deve estar visivel e habilitado
  38  |     const leverageToggle = page.locator('[data-testid="leverage-toggle"]')
  39  |     await expect(leverageToggle).toBeVisible({ timeout: 8_000 })
  40  | 
  41  |     // Nao deve estar bloqueado (locked)
  42  |     const leverageLocked = page.locator('[data-testid="leverage-toggle-locked"]')
  43  |     await expect(leverageLocked).not.toBeVisible()
  44  | 
  45  |     await expectNoServerError(page)
  46  |   })
  47  | 
  48  |   // LV-02: Jogador nao ve alavancagem desbloqueada
  49  |   test('LV-02: Usuario Jogador ve LeverageToggle bloqueado ou ausente', async ({ page }) => {
  50  |     await loginAs(page, 'jogador')
  51  |     await page.goto(`/ativo/${TEST_TICKER}`)
  52  |     await page.waitForLoadState('networkidle')
  53  | 
  54  |     const ordensTab = page.locator('[data-testid="ativo-tab-ordens"]')
  55  |     if (await ordensTab.isVisible()) {
  56  |       await ordensTab.click()
  57  |     }
  58  | 
  59  |     // Toggle pode estar ausente OU estar presente como "locked"
  60  |     const leverageToggle = page.locator('[data-testid="leverage-toggle"]')
  61  |     const leverageLocked = page.locator('[data-testid="leverage-toggle-locked"]')
  62  | 
  63  |     const isToggleVisible = await leverageToggle.isVisible().catch(() => false)
  64  |     if (isToggleVisible) {
  65  |       // Se visivel, deve estar bloqueado
  66  |       await expect(leverageLocked).toBeVisible({ timeout: 3_000 })
  67  |     }
  68  |     // Se ausente — comportamento esperado para Jogador
  69  |   })
  70  | 
  71  |   // LV-03: API aceita ordem alavancada de Lenda
  72  |   test('LV-03: POST /api/v1/orders com isLeveraged=true cria ordem com leverageRatio=2', async ({
  73  |     request,
  74  |   }) => {
  75  |     const loginRes = await request.post('/api/v1/auth/login', {
  76  |       data: { email: USERS.lenda.email, password: USERS.lenda.password },
  77  |     })
> 78  |     expect(loginRes.status()).toBe(200)
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  79  | 
  80  |     const orderRes = await request.post('/api/v1/orders', {
  81  |       data: {
  82  |         ticker: TEST_TICKER,
  83  |         side: 'BUY',
  84  |         type: 'MARKET',
  85  |         quantity: 1,
  86  |         isLeveraged: true,
  87  |       },
  88  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  89  |     })
  90  | 
  91  |     // 201 (criada) ou 422/403 se motor offline ou saldo insuficiente
  92  |     // O importante e que nao seja 500 e que isLeveraged seja processado
  93  |     expect(orderRes.status()).not.toBe(500)
  94  | 
  95  |     const body = await orderRes.json()
  96  |     if (orderRes.status() === 201) {
  97  |       expect(body.data?.order?.isLeveraged).toBe(true)
  98  |       expect(body.data?.order?.leverageRatio).toBe(2)
  99  |     }
  100 |   })
  101 | 
  102 |   // LV-03b: Craque nao pode criar ordem alavancada
  103 |   test('LV-03b: Craque nao pode criar ordem alavancada — retorna erro de plano', async ({
  104 |     request,
  105 |   }) => {
  106 |     const loginRes = await request.post('/api/v1/auth/login', {
  107 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  108 |     })
  109 |     expect(loginRes.status()).toBe(200)
  110 | 
  111 |     const orderRes = await request.post('/api/v1/orders', {
  112 |       data: {
  113 |         ticker: TEST_TICKER,
  114 |         side: 'BUY',
  115 |         type: 'MARKET',
  116 |         quantity: 1,
  117 |         isLeveraged: true,
  118 |       },
  119 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  120 |     })
  121 | 
  122 |     // Craque nao tem permissao de alavancagem — deve retornar 403 ou erro de validacao
  123 |     if (orderRes.status() === 422 || orderRes.status() === 403) {
  124 |       const body = await orderRes.json()
  125 |       expect(body.success).toBe(false)
  126 |     }
  127 |     expect(orderRes.status()).not.toBe(500)
  128 |   })
  129 | 
  130 |   // LV-04: Badge "ALAVANCADA 2x" no portfolio
  131 |   test('LV-04: Portfolio do Lenda exibe posicoes alavancadas com badge correto', async ({
  132 |     page,
  133 |   }) => {
  134 |     await loginAs(page, 'lenda')
  135 |     await page.goto('/portfolio')
  136 |     await page.waitForLoadState('networkidle')
  137 | 
  138 |     await expectNoServerError(page)
  139 | 
  140 |     // Verificar que o portfolio carrega (pode estar vazio se nao houver posicoes)
  141 |     const portfolioPage = page.locator('[data-testid="portfolio-page"]').or(
  142 |       page.locator('[data-testid="carteira-page"]')
  143 |     ).or(page.locator('main'))
  144 | 
  145 |     await expect(portfolioPage).toBeVisible({ timeout: 8_000 })
  146 | 
  147 |     // Se houver posicoes alavancadas, devem ter o badge
  148 |     const leveragedBadges = page.locator('text=/ALAVANCADA|2x/i')
  149 |     // O badge pode ou nao existir dependendo das posicoes do usuario de teste
  150 |     // Apenas verificar que nao ha erro de servidor
  151 |     const count = await leveragedBadges.count()
  152 |     if (count > 0) {
  153 |       // Se existir, deve ser visivel
  154 |       await expect(leveragedBadges.first()).toBeVisible()
  155 |     }
  156 |   })
  157 | 
  158 |   // LV-05: Cron de juros diarios de alavancagem
  159 |   test('LV-05: Cron /api/cron/leverage-interest responde 200 ou 401 (nao 500)', async ({
  160 |     request,
  161 |   }) => {
  162 |     // O cron deve ser protegido por secret header
  163 |     const res = await request.post('/api/cron/leverage-interest', {
  164 |       headers: {
  165 |         authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}`,
  166 |       },
  167 |     })
  168 | 
  169 |     // 200 (executou), 401 (secret invalido em dev) — nunca 500
  170 |     expect([200, 401, 403]).toContain(res.status())
  171 | 
  172 |     if (res.status() === 200) {
  173 |       const body = await res.json()
  174 |       expect(body.success).toBe(true)
  175 |     }
  176 |   })
  177 | 
  178 |   // LV-05b: Endpoint de juros sem secret retorna 401
```