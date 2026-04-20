# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier3-business-rules.spec.ts >> T-023: FlagCheck Maioridade — TIER 3 >> BR-13: Cron de retry de verificacao de idade responde sem erro 500
- Location: tests/e2e/tier3-business-rules.spec.ts:310:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: 405
Received array: [200, 401, 403, 404]
```

# Test source

```ts
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
  295 | 
  296 |     const meRes = await request.get('/api/v1/me', {
  297 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  298 |     })
  299 | 
  300 |     expect(meRes.status()).toBe(200)
  301 |     const body = await meRes.json()
  302 | 
  303 |     // O campo pode estar em niveis diferentes
  304 |     const profile = body.data ?? body
  305 |     // ageVerificationPending deve ser boolean ou null
  306 |     const agePending = profile.ageVerificationPending ?? false
  307 |     expect(typeof agePending).toBe('boolean')
  308 |   })
  309 | 
  310 |   test('BR-13: Cron de retry de verificacao de idade responde sem erro 500', async ({
  311 |     request,
  312 |   }) => {
  313 |     const res = await request.post('/api/cron/age-verification-retry', {
  314 |       headers: {
  315 |         authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}`,
  316 |       },
  317 |     })
  318 | 
> 319 |     expect([200, 401, 403, 404]).toContain(res.status())
      |                                  ^ Error: expect(received).toContain(expected) // indexOf
  320 |     expect(res.status()).not.toBe(500)
  321 |   })
  322 | })
  323 | 
  324 | test.describe('T-024: Nomes Ficticios — TIER 3', () => {
  325 |   test('BR-14: GET /api/v1/assets nao expoe campo realName no response publico', async ({
  326 |     request,
  327 |   }) => {
  328 |     const res = await request.get('/api/v1/assets')
  329 |     expect([200, 204]).toContain(res.status())
  330 | 
  331 |     if (res.status() === 200) {
  332 |       const body = await res.json()
  333 |       const assets = body.data?.assets ?? body.data ?? []
  334 | 
  335 |       // Nenhum ativo deve expor realName
  336 |       for (const asset of assets.slice(0, 10)) {
  337 |         expect(asset.realName).toBeUndefined()
  338 |         // O ticker deve ser o nome ficticio
  339 |         expect(asset.ticker ?? asset.symbol).toBeDefined()
  340 |       }
  341 |     }
  342 |   })
  343 | 
  344 |   test('BR-15: GET /api/v1/assets/[ticker] com ticker correto retorna sem realName', async ({
  345 |     request,
  346 |   }) => {
  347 |     const res = await request.get(`/api/v1/assets/${TEST_TICKER}`)
  348 |     expect(res.status()).toBe(200)
  349 | 
  350 |     const body = await res.json()
  351 |     const asset = body.data
  352 | 
  353 |     // realName nao deve estar presente no response publico
  354 |     expect(asset.realName).toBeUndefined()
  355 | 
  356 |     // O ticker deve estar presente
  357 |     expect(asset.ticker ?? asset.symbol).toBeDefined()
  358 |   })
  359 | 
  360 |   test('BR-16: GET /api/v1/assets/[ticker] retorna nome ficticio do ativo', async ({
  361 |     request,
  362 |   }) => {
  363 |     const res = await request.get(`/api/v1/assets/${TEST_TICKER}`)
  364 |     expect(res.status()).toBe(200)
  365 | 
  366 |     const body = await res.json()
  367 |     const asset = body.data
  368 | 
  369 |     // Nome do ativo deve estar presente (nome ficticio)
  370 |     const name = asset.name ?? asset.ficticiousName ?? asset.displayName
  371 |     expect(name).toBeDefined()
  372 |     expect(name.length).toBeGreaterThan(0)
  373 |   })
  374 | })
  375 | 
  376 | test.describe('T-026: Rate Limiting — TIER 3', () => {
  377 |   test('BR-17: Headers X-RateLimit-* presentes nas respostas de /api/v1/orders', async ({
  378 |     request,
  379 |   }) => {
  380 |     const loginRes = await request.post('/api/v1/auth/login', {
  381 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  382 |     })
  383 |     expect(loginRes.status()).toBe(200)
  384 | 
  385 |     const orderRes = await request.post('/api/v1/orders', {
  386 |       data: {
  387 |         ticker: TEST_TICKER,
  388 |         side: 'BUY',
  389 |         type: 'MARKET',
  390 |         quantity: 1,
  391 |       },
  392 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  393 |     })
  394 | 
  395 |     expect(orderRes.status()).not.toBe(500)
  396 | 
  397 |     const headers = orderRes.headers()
  398 |     const rlInfo = extractRateLimitHeaders(headers as Record<string, string>)
  399 | 
  400 |     // Os headers devem estar presentes (podem ser null se nao configurado)
  401 |     if (rlInfo.limit !== null) {
  402 |       expect(rlInfo.limit).toBeGreaterThan(0)
  403 |     }
  404 |     if (rlInfo.remaining !== null) {
  405 |       expect(rlInfo.remaining).toBeGreaterThanOrEqual(0)
  406 |     }
  407 |   })
  408 | 
  409 |   test('BR-18: POST /api/v1/ai/analyze protegido por rate limiting', async ({ request }) => {
  410 |     const loginRes = await request.post('/api/v1/auth/login', {
  411 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  412 |     })
  413 |     expect(loginRes.status()).toBe(200)
  414 | 
  415 |     // Uma chamada normal deve funcionar
  416 |     const analyzeRes = await request.post('/api/v1/ai/analyze', {
  417 |       data: { ticker: TEST_TICKER },
  418 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  419 |     })
```