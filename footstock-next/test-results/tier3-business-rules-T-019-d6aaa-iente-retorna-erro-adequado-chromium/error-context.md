# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier3-business-rules.spec.ts >> T-019: Saldo Zero — TIER 3 >> BR-05: POST /api/v1/orders BUY com saldo insuficiente retorna erro adequado
- Location: tests/e2e/tier3-business-rules.spec.ts:142:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
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
  108 |     const loginRes = await request.post('/api/v1/auth/login', {
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
> 148 |     expect(loginRes.status()).toBe(200)
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
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
  209 | 
  210 |     // Jogador nao pode criar LIMIT — deve retornar 403 ou 422
  211 |     expect([403, 422]).toContain(orderRes.status())
  212 |     expect(orderRes.status()).not.toBe(201)
  213 |     expect(orderRes.status()).not.toBe(500)
  214 | 
  215 |     const body = await orderRes.json()
  216 |     expect(body.success).toBe(false)
  217 |   })
  218 | 
  219 |   test('BR-08: GET /api/v1/orders/daily-count sem auth retorna 401', async ({ request }) => {
  220 |     const res = await request.get('/api/v1/orders/daily-count')
  221 |     expect(res.status()).toBe(401)
  222 |   })
  223 | })
  224 | 
  225 | test.describe('T-021: Bonus 7 Dias — TIER 3', () => {
  226 |   test('BR-09: GET /api/v1/subscriptions/me retorna campos de bonus', async ({ request }) => {
  227 |     const loginRes = await request.post('/api/v1/auth/login', {
  228 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  229 |     })
  230 |     expect(loginRes.status()).toBe(200)
  231 | 
  232 |     const res = await request.get('/api/v1/subscriptions/me', {
  233 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  234 |     })
  235 | 
  236 |     expect([200, 404]).toContain(res.status())
  237 | 
  238 |     if (res.status() === 200) {
  239 |       const body = await res.json()
  240 |       expect(body.success).toBe(true)
  241 | 
  242 |       const sub = body.data
  243 |       // Campos de bonus devem estar presentes (podem ser null)
  244 |       expect('bonusScheduledAt' in sub || 'bonus_scheduled_at' in sub || true).toBe(true)
  245 |     }
  246 |   })
  247 | 
  248 |   test('BR-10: Cron de bonus 7 dias responde sem erro 500', async ({ request }) => {
```