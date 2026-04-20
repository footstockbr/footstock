# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier3-business-rules.spec.ts >> T-020: Limites de Ordens — TIER 3 >> BR-07: Jogador nao pode criar ordem LIMIT (tipo nao permitido)
- Location: tests/e2e/tier3-business-rules.spec.ts:193:7

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
> 194 |     const loginRes = await request.post('/api/v1/auth/login', {
      |                                    ^ Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
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
  249 |     const res = await request.post('/api/cron/bonus-credit', {
  250 |       headers: {
  251 |         authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}`,
  252 |       },
  253 |     })
  254 | 
  255 |     expect([200, 401, 403, 404]).toContain(res.status())
  256 |     expect(res.status()).not.toBe(500)
  257 |   })
  258 | })
  259 | 
  260 | test.describe('T-023: FlagCheck Maioridade — TIER 3', () => {
  261 |   test('BR-11: Registro com dados de menor de idade retorna erro de validacao', async ({
  262 |     request,
  263 |   }) => {
  264 |     const email = uniqueEmail('minor')
  265 |     const birthDateMinor = new Date()
  266 |     birthDateMinor.setFullYear(birthDateMinor.getFullYear() - 15) // 15 anos
  267 | 
  268 |     const res = await request.post('/api/v1/auth/register', {
  269 |       data: {
  270 |         name: 'Usuario Menor',
  271 |         email,
  272 |         password: 'TestMenor123!',
  273 |         cpf: VALID_CPF_MINOR,
  274 |         birthDate: birthDateMinor.toISOString().split('T')[0],
  275 |         phone: '11999999998',
  276 |         favoriteClub: 'URU3',
  277 |         termsAccepted: true,
  278 |       },
  279 |     })
  280 | 
  281 |     // Deve rejeitar menor de idade — 400, 422, ou 403
  282 |     expect([400, 422, 403]).toContain(res.status())
  283 |     expect(res.status()).not.toBe(201)
  284 |     expect(res.status()).not.toBe(500)
  285 | 
  286 |     const body = await res.json()
  287 |     expect(body.success).toBe(false)
  288 |   })
  289 | 
  290 |   test('BR-12: GET /api/v1/me retorna campo ageVerificationPending', async ({ request }) => {
  291 |     const loginRes = await request.post('/api/v1/auth/login', {
  292 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  293 |     })
  294 |     expect(loginRes.status()).toBe(200)
```