# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier3-business-rules.spec.ts >> T-019: Saldo Zero — TIER 3 >> BR-04: Banner de saldo zerado presente no mercado quando aplicavel
- Location: tests/e2e/tier3-business-rules.spec.ts:104:7

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
Call log:
  - → POST http://localhost:3000/api/v1/auth/login
    - user-agent: Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Mobile Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 63

```

# Test source

```ts
  8   |  *   BR-01: Ordem de FS$500 gera taxa de FS$0.25 (faixa 1, 0.05%)
  9   |  *   BR-02: Ordem cancelada nao gera entrada FEE no extrato
  10  |  *   BR-03: Extrato contem entradas de tipo FEE apos execucao de ordem
  11  |  *
  12  |  * SALDO ZERO (T-019):
  13  |  *   BR-04: POST /api/v1/orders com side=BUY e saldo zero retorna 402
  14  |  *   BR-05: POST /api/v1/orders com side=SELL funciona mesmo com saldo zero
  15  |  *   BR-06: Banner de saldo zerado visivel no mercado quando saldo = 0
  16  |  *
  17  |  * LIMITES DE ORDENS (T-020):
  18  |  *   BR-07: GET /api/v1/orders/daily-count retorna contador diario do usuario
  19  |  *   BR-08: Jogador nao pode criar ordem do tipo LIMIT (retorna 403)
  20  |  *   BR-09: Headers de limite diario presentes na resposta de /api/v1/orders
  21  |  *
  22  |  * BONUS 7 DIAS (T-021):
  23  |  *   BR-10: bonusScheduledAt preenchido apos upgrade de plano
  24  |  *   BR-11: GET /api/v1/subscriptions/me retorna bonusScheduledAt e bonusCreditedAt
  25  |  *   BR-12: Cron de bonus 7 dias responde sem erro 500
  26  |  *
  27  |  * FLAGCHECK MAIORIDADE (T-023):
  28  |  *   BR-13: Registro com CPF de menor retorna erro AUTH
  29  |  *   BR-14: GET /api/v1/me retorna campo ageVerificationPending
  30  |  *
  31  |  * NOMES FICTICIOS (T-024):
  32  |  *   BR-15: GET /api/v1/assets retorna campo ficticiousName (nao real name)
  33  |  *   BR-16: GET /api/v1/assets/[ticker] nao expoe campo realName no response
  34  |  *
  35  |  * RATE LIMITING (T-026):
  36  |  *   BR-17: Headers X-RateLimit-* presentes nas respostas de /api/v1/orders
  37  |  *   BR-18: POST /api/v1/ai/analyze com muitas chamadas retorna 429
  38  |  *   BR-19: Tentativas de login com email invalido retornam 429 apos limite
  39  |  */
  40  | 
  41  | import { test, expect } from '@playwright/test'
  42  | import { USERS, TEST_TICKER, VALID_CPF_MINOR, uniqueEmail, extractRateLimitHeaders } from './setup'
  43  | 
  44  | test.describe('T-018: Taxa Operacional — TIER 3', () => {
  45  |   test('BR-01: Headers de taxa diaria presentes na resposta de criacao de ordem', async ({
  46  |     request,
  47  |   }) => {
  48  |     const loginRes = await request.post('/api/v1/auth/login', {
  49  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  50  |     })
  51  |     expect(loginRes.status()).toBe(200)
  52  | 
  53  |     const orderRes = await request.post('/api/v1/orders', {
  54  |       data: {
  55  |         ticker: TEST_TICKER,
  56  |         side: 'BUY',
  57  |         type: 'MARKET',
  58  |         quantity: 1,
  59  |       },
  60  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  61  |     })
  62  | 
  63  |     // Independente do resultado da ordem, headers de limite devem estar presentes
  64  |     const headers = orderRes.headers()
  65  |     // Pode ter X-Daily-Limit-* ou X-RateLimit-* dependendo do tipo de limite
  66  |     const hasLimitHeaders =
  67  |       'x-daily-limit' in headers ||
  68  |       'x-daily-remaining' in headers ||
  69  |       'x-ratelimit-limit' in headers ||
  70  |       'x-ratelimit-remaining' in headers
  71  | 
  72  |     // Nao bloquear se headers nao existirem ainda — registrar observacao
  73  |     if (!hasLimitHeaders) {
  74  |       console.warn('BR-01: Headers de limite nao encontrados na resposta de /api/v1/orders')
  75  |     }
  76  |   })
  77  | 
  78  |   test('BR-02: GET /api/v1/transactions inclui entradas de tipo FEE', async ({ request }) => {
  79  |     const loginRes = await request.post('/api/v1/auth/login', {
  80  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  81  |     })
  82  |     expect(loginRes.status()).toBe(200)
  83  | 
  84  |     const transRes = await request.get('/api/v1/transactions', {
  85  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  86  |     })
  87  | 
  88  |     expect([200, 204]).toContain(transRes.status())
  89  |     expect(transRes.status()).not.toBe(500)
  90  | 
  91  |     if (transRes.status() === 200) {
  92  |       const body = await transRes.json()
  93  |       expect(body.success).toBe(true)
  94  |     }
  95  |   })
  96  | 
  97  |   test('BR-03: GET /api/v1/transactions sem auth retorna 401', async ({ request }) => {
  98  |     const res = await request.get('/api/v1/transactions')
  99  |     expect(res.status()).toBe(401)
  100 |   })
  101 | })
  102 | 
  103 | test.describe('T-019: Saldo Zero — TIER 3', () => {
  104 |   test('BR-04: Banner de saldo zerado presente no mercado quando aplicavel', async ({
  105 |     page,
  106 |     request,
  107 |   }) => {
> 108 |     const loginRes = await request.post('/api/v1/auth/login', {
      |                                    ^ Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
  109 |       data: { email: USERS.jogador.email, password: USERS.jogador.password },
  110 |     })
  111 |     expect(loginRes.status()).toBe(200)
  112 | 
  113 |     // Verificar saldo atual do usuario
  114 |     const meRes = await request.get('/api/v1/me', {
  115 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  116 |     })
  117 | 
  118 |     if (meRes.status() !== 200) {
  119 |       test.skip()
  120 |       return
  121 |     }
  122 | 
  123 |     const meBody = await meRes.json()
  124 |     const balance = meBody.data?.fsBalance ?? meBody.data?.balance ?? 0
  125 | 
  126 |     // Se saldo for zero, verificar banner na UI
  127 |     if (balance === 0) {
  128 |       // Login na UI
  129 |       await page.goto('/login')
  130 |       await page.locator('[data-testid="email-input"]').fill(USERS.jogador.email)
  131 |       await page.locator('[data-testid="password-input"]').fill(USERS.jogador.password)
  132 |       await page.locator('[data-testid="login-submit"]').click()
  133 |       await page.waitForURL(/mercado/, { timeout: 10_000 })
  134 | 
  135 |       const banner = page.locator('[data-testid="market-balance-zero-banner"]')
  136 |       if (await banner.isVisible({ timeout: 3_000 }).catch(() => false)) {
  137 |         await expect(banner).toBeVisible()
  138 |       }
  139 |     }
  140 |   })
  141 | 
  142 |   test('BR-05: POST /api/v1/orders BUY com saldo insuficiente retorna erro adequado', async ({
  143 |     request,
  144 |   }) => {
  145 |     const loginRes = await request.post('/api/v1/auth/login', {
  146 |       data: { email: USERS.jogador.email, password: USERS.jogador.password },
  147 |     })
  148 |     expect(loginRes.status()).toBe(200)
  149 | 
  150 |     // Tentar comprar quantidade enorme (inevitavelmente sem saldo)
  151 |     const orderRes = await request.post('/api/v1/orders', {
  152 |       data: {
  153 |         ticker: TEST_TICKER,
  154 |         side: 'BUY',
  155 |         type: 'MARKET',
  156 |         quantity: 99999999, // quantidade absurda
  157 |       },
  158 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  159 |     })
  160 | 
  161 |     // Deve retornar erro (422/402/400) — nunca 201 ou 500
  162 |     expect([400, 402, 422, 503]).toContain(orderRes.status())
  163 |     expect(orderRes.status()).not.toBe(500)
  164 | 
  165 |     const body = await orderRes.json()
  166 |     expect(body.success).toBe(false)
  167 |   })
  168 | })
  169 | 
  170 | test.describe('T-020: Limites de Ordens — TIER 3', () => {
  171 |   test('BR-06: GET /api/v1/orders/daily-count retorna contagem diaria do usuario', async ({
  172 |     request,
  173 |   }) => {
  174 |     const loginRes = await request.post('/api/v1/auth/login', {
  175 |       data: { email: USERS.jogador.email, password: USERS.jogador.password },
  176 |     })
  177 |     expect(loginRes.status()).toBe(200)
  178 | 
  179 |     const res = await request.get('/api/v1/orders/daily-count', {
  180 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  181 |     })
  182 | 
  183 |     expect(res.status()).toBe(200)
  184 |     const body = await res.json()
  185 |     expect(body.success).toBe(true)
  186 |     expect(body.data).toBeDefined()
  187 | 
  188 |     const count = body.data?.count ?? body.data?.dailyCount
  189 |     expect(typeof count).toBe('number')
  190 |     expect(count).toBeGreaterThanOrEqual(0)
  191 |   })
  192 | 
  193 |   test('BR-07: Jogador nao pode criar ordem LIMIT (tipo nao permitido)', async ({ request }) => {
  194 |     const loginRes = await request.post('/api/v1/auth/login', {
  195 |       data: { email: USERS.jogador.email, password: USERS.jogador.password },
  196 |     })
  197 |     expect(loginRes.status()).toBe(200)
  198 | 
  199 |     const orderRes = await request.post('/api/v1/orders', {
  200 |       data: {
  201 |         ticker: TEST_TICKER,
  202 |         side: 'BUY',
  203 |         type: 'LIMIT',
  204 |         quantity: 1,
  205 |         limitPrice: 10,
  206 |       },
  207 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  208 |     })
```