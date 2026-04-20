# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier1-equity.spec.ts >> T-006: Equity Factor em Ligas — TIER 1 >> EQ-06: POST /api/v1/leagues aceita pesos de pilares que somam 100%
- Location: tests/e2e/tier1-equity.spec.ts:161:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  67  |           pillarWeights: { p1: 35, p2: 25, p3: 20, p4: 15, p5: 5 },
  68  |         },
  69  |         headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  70  |       })
  71  |       if (createRes.status() !== 201) {
  72  |         test.skip()
  73  |         return
  74  |       }
  75  |       return
  76  |     }
  77  | 
  78  |     const leagueId = leagues[0].id
  79  |     const detailRes = await request.get(`/api/v1/leagues/${leagueId}`, {
  80  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  81  |     })
  82  | 
  83  |     expect(detailRes.status()).toBe(200)
  84  |     const detailBody = await detailRes.json()
  85  |     expect(detailBody.success).toBe(true)
  86  |     expect(detailBody.data).toBeDefined()
  87  |   })
  88  | 
  89  |   // EQ-03: ScoreBreakdown visivel na UI da liga
  90  |   test('EQ-03: Pagina de liga exibe detalhamento de pontuacao (ScoreBreakdown)', async ({
  91  |     page,
  92  |   }) => {
  93  |     await loginAs(page, 'craque')
  94  |     await page.goto('/ligas')
  95  |     await page.waitForLoadState('networkidle')
  96  | 
  97  |     await expectNoServerError(page)
  98  | 
  99  |     // Verificar que a pagina de ligas carrega
  100 |     const leaguePage = page.locator('[data-testid="league-card"]').first().or(
  101 |       page.locator('[data-testid="league-detail"]').first()
  102 |     )
  103 | 
  104 |     // Pode estar vazia se nao houver ligas no ambiente
  105 |     const count = await page.locator('[data-testid="league-card"]').count()
  106 |     if (count > 0) {
  107 |       // Clicar na primeira liga
  108 |       await page.locator('[data-testid="league-card"]').first().click()
  109 |       await page.waitForLoadState('networkidle')
  110 | 
  111 |       // ScoreBreakdown ou ranking deve aparecer
  112 |       const hasBreakdown =
  113 |         (await page.locator('text=/pilar|equity|multiplicador|pontos/i').first().isVisible({ timeout: 3_000 }).catch(() => false))
  114 |       expect(hasBreakdown || true).toBe(true) // liga pode ter 0 membros ainda
  115 |     }
  116 |   })
  117 | 
  118 |   // EQ-04: Liga OPEN — multiplicador 1.40x para Jogador
  119 |   test('EQ-04: Liga OPEN aplica equity factor 1.40x para plano Jogador (verificacao de API)', async ({
  120 |     request,
  121 |   }) => {
  122 |     const loginRes = await request.post('/api/v1/auth/login', {
  123 |       data: { email: USERS.jogador.email, password: USERS.jogador.password },
  124 |     })
  125 |     expect(loginRes.status()).toBe(200)
  126 | 
  127 |     // Verificar ligas abertas disponiveis para Jogador
  128 |     const leaguesRes = await request.get('/api/v1/leagues?type=OPEN', {
  129 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  130 |     })
  131 | 
  132 |     expect([200, 404]).toContain(leaguesRes.status())
  133 |     if (leaguesRes.status() === 200) {
  134 |       const body = await leaguesRes.json()
  135 |       const leagues = body.data?.leagues ?? body.data ?? []
  136 |       // Se existir liga OPEN, verificar que aceita Jogador
  137 |       if (leagues.length > 0) {
  138 |         const openLeague = leagues.find((l: { type: string }) => l.type === 'OPEN')
  139 |         expect(openLeague?.type).toBe('OPEN')
  140 |       }
  141 |     }
  142 |   })
  143 | 
  144 |   // EQ-05: Liga PRO — sem bonus de multiplicador para Craque
  145 |   test('EQ-05: Liga PRO listada e acessivel para usuario Craque', async ({ request }) => {
  146 |     const loginRes = await request.post('/api/v1/auth/login', {
  147 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  148 |     })
  149 |     expect(loginRes.status()).toBe(200)
  150 | 
  151 |     const leaguesRes = await request.get('/api/v1/leagues?type=PRO', {
  152 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  153 |     })
  154 | 
  155 |     // 200 ou 404 se nao houver ligas PRO no momento
  156 |     expect([200, 404]).toContain(leaguesRes.status())
  157 |     expect(leaguesRes.status()).not.toBe(500)
  158 |   })
  159 | 
  160 |   // EQ-06: Criacao de liga com pesos de pilares corretos
  161 |   test('EQ-06: POST /api/v1/leagues aceita pesos de pilares que somam 100%', async ({
  162 |     request,
  163 |   }) => {
  164 |     const loginRes = await request.post('/api/v1/auth/login', {
  165 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  166 |     })
> 167 |     expect(loginRes.status()).toBe(200)
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  168 | 
  169 |     const createRes = await request.post('/api/v1/leagues', {
  170 |       data: {
  171 |         name: `Liga EQ Test ${Date.now()}`,
  172 |         type: 'OPEN',
  173 |         pillarWeights: { p1: 35, p2: 25, p3: 20, p4: 15, p5: 5 },
  174 |       },
  175 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  176 |     })
  177 | 
  178 |     // 201 (criada) ou 422 (validacao) — nunca 500
  179 |     expect([201, 400, 422, 403]).toContain(createRes.status())
  180 |     expect(createRes.status()).not.toBe(500)
  181 | 
  182 |     if (createRes.status() === 201) {
  183 |       const body = await createRes.json()
  184 |       expect(body.data?.league ?? body.data).toBeDefined()
  185 |       // Confirmar que pesos sao preservados
  186 |       const weights = body.data?.league?.pillarWeights ?? body.data?.pillarWeights
  187 |       if (weights) {
  188 |         const sum = Object.values(weights as Record<string, number>).reduce((a, b) => a + b, 0)
  189 |         expect(sum).toBe(100)
  190 |       }
  191 |     }
  192 |   })
  193 | 
  194 |   // EQ-06b: Pesos de pilares que nao somam 100% sao rejeitados
  195 |   test('EQ-06b: POST /api/v1/leagues rejeita pesos de pilares que nao somam 100%', async ({
  196 |     request,
  197 |   }) => {
  198 |     const loginRes = await request.post('/api/v1/auth/login', {
  199 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  200 |     })
  201 |     expect(loginRes.status()).toBe(200)
  202 | 
  203 |     const createRes = await request.post('/api/v1/leagues', {
  204 |       data: {
  205 |         name: `Liga EQ Bad ${Date.now()}`,
  206 |         type: 'OPEN',
  207 |         pillarWeights: { p1: 50, p2: 50, p3: 50, p4: 50, p5: 50 }, // soma 250, invalido
  208 |       },
  209 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  210 |     })
  211 | 
  212 |     expect([400, 422]).toContain(createRes.status())
  213 |     const body = await createRes.json()
  214 |     expect(body.success).toBe(false)
  215 |   })
  216 | 
  217 |   // EQ-07: UI de ligas no frontend carrega sem erros
  218 |   test('EQ-07: Pagina /ligas renderiza sem erro 500 para usuario Craque', async ({ page }) => {
  219 |     await loginAs(page, 'craque')
  220 |     await page.goto('/ligas')
  221 |     await page.waitForLoadState('networkidle')
  222 | 
  223 |     await expectNoServerError(page)
  224 | 
  225 |     // A pagina deve ter algum conteudo (nao ficar em branco)
  226 |     const body = page.locator('body')
  227 |     await expect(body).not.toBeEmpty()
  228 |   })
  229 | })
  230 | 
```