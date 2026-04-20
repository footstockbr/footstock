# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-flows.spec.ts >> Smoke Tests — API Health Check >> GET /api/v1/assets retorna 401 sem auth (rota protegida)
- Location: tests/e2e/e2e-flows.spec.ts:397:7

# Error details

```
Error: apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:3000
Call log:
  - → GET http://localhost:3000/api/v1/assets
    - user-agent: Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Mobile Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br

```

# Test source

```ts
  298 |     await page.waitForLoadState('networkidle')
  299 |     await expectNoServerError(page)
  300 |   })
  301 | })
  302 | 
  303 | // ─── F6: Login → Ligas (ECU 1-6) ────────────────────────────────────────────
  304 | 
  305 | test.describe('F6: Ligas — Visualização e Participação', () => {
  306 |   /**
  307 |    * US-017, US-018 — Ligas Públicas e Privadas
  308 |    * ECU 1-6: fluxo completo
  309 |    */
  310 | 
  311 |   test.beforeEach(async ({ page }) => {
  312 |     await loginAs(page, 'craque')
  313 |   })
  314 | 
  315 |   test('/ligas carrega lista sem erro 500', async ({ page }) => {
  316 |     await page.goto('/ligas')
  317 |     await page.waitForLoadState('networkidle')
  318 |     await expectNoServerError(page)
  319 |   })
  320 | 
  321 |   test('/ligas: CTA de criar liga existe para CRAQUE', async ({ page }) => {
  322 |     await page.goto('/ligas')
  323 |     await page.waitForLoadState('networkidle')
  324 | 
  325 |     const createBtn = page.getByRole('button', { name: /criar|nova liga/i })
  326 |       .or(page.getByRole('link', { name: /criar|nova liga/i }))
  327 |     // CRAQUE pode criar liga — botão deve existir
  328 |     const isVisible = await createBtn.isVisible().catch(() => false)
  329 |     expect(typeof isVisible).toBe('boolean')
  330 |   })
  331 | 
  332 |   test('/ligas/criar carrega formulário de criação', async ({ page }) => {
  333 |     await page.goto('/ligas/criar')
  334 |     await page.waitForLoadState('networkidle')
  335 |     await expectNoServerError(page)
  336 |   })
  337 | 
  338 |   test('/ligas/[id] inválido mostra erro gracioso', async ({ page }) => {
  339 |     await page.goto('/ligas/liga-inexistente-xyz')
  340 |     await page.waitForLoadState('networkidle')
  341 |     await expectNoServerError(page)
  342 |   })
  343 | })
  344 | 
  345 | // ─── ECU Check Final: Zero erros 500 em rotas principais ─────────────────────
  346 | 
  347 | test.describe('ECU Final: Zero erros 500 — Varredura de rotas principais', () => {
  348 |   let context: BrowserContext
  349 | 
  350 |   test.beforeAll(async ({ browser }) => {
  351 |     context = await browser.newContext()
  352 |     const page = await context.newPage()
  353 |     await loginAs(page, 'craque')
  354 |     await page.close()
  355 |   })
  356 | 
  357 |   test.afterAll(async () => {
  358 |     await context.close()
  359 |   })
  360 | 
  361 |   const criticalRoutes = [
  362 |     '/mercado',
  363 |     '/portfolio',
  364 |     '/noticias',
  365 |     '/ligas',
  366 |     '/assessor',
  367 |     '/glossario',
  368 |     '/inbox',
  369 |     '/perfil',
  370 |     '/planos',
  371 |     '/admin',
  372 |   ]
  373 | 
  374 |   for (const route of criticalRoutes) {
  375 |     test(`${route} não retorna erro 500`, async ({ page }) => {
  376 |       await page.goto(route)
  377 |       await page.waitForLoadState('networkidle')
  378 | 
  379 |       const has500 = await page.locator('text=/500|internal server error/i').isVisible()
  380 |       expect(has500).toBe(false)
  381 |     })
  382 |   }
  383 | })
  384 | 
  385 | // ─── Smoke Tests — API Health ─────────────────────────────────────────────────
  386 | 
  387 | test.describe('Smoke Tests — API Health Check', () => {
  388 |   test('GET /api/v1/health retorna status ok', async ({ page }) => {
  389 |     const response = await page.request.get('/api/v1/health')
  390 |     expect(response.status()).toBeLessThan(500)
  391 | 
  392 |     const body = await response.json()
  393 |     expect(body).toHaveProperty('status')
  394 |     expect(body.status).toMatch(/ok|degraded/)
  395 |   })
  396 | 
  397 |   test('GET /api/v1/assets retorna 401 sem auth (rota protegida)', async ({ page }) => {
> 398 |     const response = await page.request.get('/api/v1/assets')
      |                                         ^ Error: apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:3000
  399 |     // Sem cookie de sessão, deve retornar 401
  400 |     expect(response.status()).toBe(401)
  401 |   })
  402 | })
  403 | 
```