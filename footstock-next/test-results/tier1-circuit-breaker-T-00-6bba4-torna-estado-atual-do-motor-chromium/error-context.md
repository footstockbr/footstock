# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier1-circuit-breaker.spec.ts >> T-004: Circuit Breaker — TIER 1 >> CB-07: GET /api/v1/admin/motor/status retorna estado atual do motor
- Location: tests/e2e/tier1-circuit-breaker.spec.ts:214:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
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
  137 |     expect(badgeVisible).toBe(true)
  138 |   })
  139 | 
  140 |   // CB-04: Admin acessa painel de halt control
  141 |   test('CB-04: Admin ve HaltControl no painel do motor', async ({ page }) => {
  142 |     await loginAs(page, 'admin')
  143 |     await page.goto('/admin/motor')
  144 |     await page.waitForLoadState('networkidle')
  145 | 
  146 |     // HaltControl deve estar presente
  147 |     const haltControl = page.locator('[data-testid="halt-control"]')
  148 |     await expect(haltControl).toBeVisible({ timeout: 8_000 })
  149 | 
  150 |     // Botao de overlay de halt deve estar acessivel
  151 |     const haltButtons = page.locator('[data-testid="halt-buttons-overlay"]')
  152 |     await expect(haltButtons).toBeVisible({ timeout: 5_000 })
  153 | 
  154 |     await expectNoServerError(page)
  155 |   })
  156 | 
  157 |   // CB-05: Admin libera halt via API
  158 |   test('CB-05: Admin pode liberar halt e ordens voltam a funcionar', async ({ request }) => {
  159 |     const adminLoginRes = await request.post('/api/v1/auth/login', {
  160 |       data: { email: USERS.admin.email, password: USERS.admin.password },
  161 |     })
  162 | 
  163 |     // Ativar halt
  164 |     await request.post(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
  165 |       data: { reason: 'Teste E2E CB-05' },
  166 |       headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
  167 |     })
  168 | 
  169 |     // Liberar halt
  170 |     const releaseRes = await request.delete(`/api/v1/admin/assets/${TEST_TICKER}/halt`, {
  171 |       headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
  172 |     })
  173 | 
  174 |     expect([200, 204]).toContain(releaseRes.status())
  175 | 
  176 |     // Verificar que ordens voltam a ser aceitas pelo motor (status do ativo)
  177 |     const assetRes = await request.get(`/api/v1/assets/${TEST_TICKER}`)
  178 |     expect(assetRes.status()).toBe(200)
  179 |     const assetBody = await assetRes.json()
  180 |     // Campo halted deve ser false ou ausente
  181 |     const isHalted = assetBody.data?.halted ?? false
  182 |     expect(isHalted).toBe(false)
  183 |   })
  184 | 
  185 |   // CB-06: Global halt bloqueia todos os ativos
  186 |   test('CB-06: Global halt via /api/v1/admin/motor/global-halt bloqueia operacoes', async ({
  187 |     request,
  188 |   }) => {
  189 |     const adminLoginRes = await request.post('/api/v1/auth/login', {
  190 |       data: { email: USERS.admin.email, password: USERS.admin.password },
  191 |     })
  192 | 
  193 |     // Ativar global halt
  194 |     const globalHaltRes = await request.post('/api/v1/admin/motor/global-halt', {
  195 |       data: { reason: 'Teste E2E global halt' },
  196 |       headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
  197 |     })
  198 | 
  199 |     expect([200, 201]).toContain(globalHaltRes.status())
  200 | 
  201 |     // Status do motor deve refletir o halt
  202 |     const motorStatusRes = await request.get('/api/v1/admin/motor/status', {
  203 |       headers: { cookie: adminLoginRes.headers()['set-cookie'] ?? '' },
  204 |     })
  205 |     expect(motorStatusRes.status()).toBe(200)
  206 |     const statusBody = await motorStatusRes.json()
  207 |     expect(statusBody.data).toBeDefined()
  208 | 
  209 |     // Liberar o halt global apos o teste
  210 |     await releaseAllHalts(request)
  211 |   })
  212 | 
  213 |   // CB-07: Endpoint de status do motor disponivel
  214 |   test('CB-07: GET /api/v1/admin/motor/status retorna estado atual do motor', async ({
  215 |     request,
  216 |   }) => {
  217 |     const loginRes = await request.post('/api/v1/auth/login', {
  218 |       data: { email: USERS.admin.email, password: USERS.admin.password },
  219 |     })
  220 | 
  221 |     const res = await request.get('/api/v1/admin/motor/status', {
  222 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  223 |     })
  224 | 
> 225 |     expect(res.status()).toBe(200)
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  226 |     const body = await res.json()
  227 |     expect(body.success).toBe(true)
  228 |     expect(body.data).toBeDefined()
  229 |   })
  230 | })
  231 | 
```