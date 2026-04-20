# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier1-leverage.spec.ts >> T-003: Alavancagem 2x Lenda — TIER 1 >> LV-05b: Cron leverage-interest sem authorization retorna 401
- Location: tests/e2e/tier1-leverage.spec.ts:179:7

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
Call log:
  - → POST http://localhost:3000/api/cron/leverage-interest
    - user-agent: Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Mobile Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br

```

# Test source

```ts
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
  179 |   test('LV-05b: Cron leverage-interest sem authorization retorna 401', async ({ request }) => {
> 180 |     const res = await request.post('/api/cron/leverage-interest')
      |                               ^ Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
  181 |     expect([401, 403]).toContain(res.status())
  182 |   })
  183 | 
  184 |   // LV-06: Ordem alavancada com quantidade invalida
  185 |   test('LV-06: Ordem alavancada com quantidade 0 retorna erro de validacao', async ({
  186 |     request,
  187 |   }) => {
  188 |     const loginRes = await request.post('/api/v1/auth/login', {
  189 |       data: { email: USERS.lenda.email, password: USERS.lenda.password },
  190 |     })
  191 | 
  192 |     const orderRes = await request.post('/api/v1/orders', {
  193 |       data: {
  194 |         ticker: TEST_TICKER,
  195 |         side: 'BUY',
  196 |         type: 'MARKET',
  197 |         quantity: 0,
  198 |         isLeveraged: true,
  199 |       },
  200 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  201 |     })
  202 | 
  203 |     expect([400, 422]).toContain(orderRes.status())
  204 |     const body = await orderRes.json()
  205 |     expect(body.success).toBe(false)
  206 |   })
  207 | })
  208 | 
```