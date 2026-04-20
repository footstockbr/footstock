# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier3-business-rules.spec.ts >> T-026: Rate Limiting — TIER 3 >> BR-18: POST /api/v1/ai/analyze protegido por rate limiting
- Location: tests/e2e/tier3-business-rules.spec.ts:409:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 429
```

# Test source

```ts
  313 |     const res = await request.post('/api/cron/age-verification-retry', {
  314 |       headers: {
  315 |         authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}`,
  316 |       },
  317 |     })
  318 | 
  319 |     expect([200, 401, 403, 404]).toContain(res.status())
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
> 413 |     expect(loginRes.status()).toBe(200)
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  414 | 
  415 |     // Uma chamada normal deve funcionar
  416 |     const analyzeRes = await request.post('/api/v1/ai/analyze', {
  417 |       data: { ticker: TEST_TICKER },
  418 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  419 |     })
  420 | 
  421 |     // Pode ser 200 (ok), 429 (rate limit ja atingido), 402 (plano sem acesso), 503 (motor)
  422 |     expect([200, 429, 402, 403, 422, 503]).toContain(analyzeRes.status())
  423 |     expect(analyzeRes.status()).not.toBe(500)
  424 |   })
  425 | 
  426 |   test('BR-19: Login com credenciais invalidas repetidas retorna 429 apos limite', async ({
  427 |     request,
  428 |   }) => {
  429 |     const fakeEmail = uniqueEmail('bruteforce')
  430 | 
  431 |     let lastStatus = 0
  432 |     // Fazer varias tentativas com email invalido
  433 |     for (let i = 0; i < 7; i++) {
  434 |       const res = await request.post('/api/v1/auth/login', {
  435 |         data: { email: fakeEmail, password: 'wrongpassword' },
  436 |       })
  437 |       lastStatus = res.status()
  438 |       // Se ja recebeu 429, parar
  439 |       if (res.status() === 429) break
  440 |     }
  441 | 
  442 |     // Apos varias tentativas falhas, deve receber 401 ou 429
  443 |     // (depende da configuracao de rate limit por IP/email)
  444 |     expect([401, 429]).toContain(lastStatus)
  445 |     expect(lastStatus).not.toBe(500)
  446 |   })
  447 | 
  448 |   test('BR-20: POST /api/v1/auth/login retorna headers de rate limit', async ({ request }) => {
  449 |     const res = await request.post('/api/v1/auth/login', {
  450 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  451 |     })
  452 | 
  453 |     expect([200, 401, 429]).toContain(res.status())
  454 |     expect(res.status()).not.toBe(500)
  455 |   })
  456 | })
  457 | 
```