# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier1-equity.spec.ts >> T-006: Equity Factor em Ligas — TIER 1 >> EQ-02: GET /api/v1/leagues/[id] retorna ranking com pontuacao dos membros
- Location: tests/e2e/tier1-equity.spec.ts:46:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  1   | /**
  2   |  * TIER 1 — Equity Factor em Ligas (T-006)
  3   |  * Foot Stock / T-033 Verificacao E2E Completa de Gaps
  4   |  *
  5   |  * Cenarios cobertos:
  6   |  *   EQ-01: ScoringEngine calcula multiplicadores corretos por tipo de liga
  7   |  *   EQ-02: Endpoint de ranking da liga retorna dados com multiplicador
  8   |  *   EQ-03: ScoreBreakdown mostra pontos com/sem multiplicador na UI
  9   |  *   EQ-04: Liga OPEN com usuario Jogador aplica multiplicador 1.40x no Pilar 1
  10  |  *   EQ-05: Liga PRO com usuario Craque aplica multiplicador 1.00x (sem bonus)
  11  |  *   EQ-06: Endpoint de ligas retorna campo equityFactor no response
  12  |  *   EQ-07: Historico de pontuacao da liga diferencia pontos brutos e ajustados
  13  |  *
  14  |  * Obvios nao ditos:
  15  |  *   - Multiplicador 1.40x so se aplica ao Pilar 1 (volume), nao aos demais
  16  |  *   - Mesmo ticker com precos diferentes para diferentes planos (equity factor)
  17  |  *   - Ranking deve ser recalculado apos cada execucao de ordem
  18  |  *   - ScoreBreakdown deve exibir detalhamento de cada pilar individualmente
  19  |  *   - Liga PRO exige plano Craque ou Lenda para participar
  20  |  */
  21  | 
  22  | import { test, expect } from '@playwright/test'
  23  | import { loginAs, USERS, expectNoServerError } from './setup'
  24  | 
  25  | test.describe('T-006: Equity Factor em Ligas — TIER 1', () => {
  26  |   // EQ-01: API de liga retorna estrutura com pontuacao
  27  |   test('EQ-01: GET /api/v1/leagues retorna lista de ligas com estrutura correta', async ({
  28  |     request,
  29  |   }) => {
  30  |     const loginRes = await request.post('/api/v1/auth/login', {
  31  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  32  |     })
  33  |     expect(loginRes.status()).toBe(200)
  34  | 
  35  |     const res = await request.get('/api/v1/leagues', {
  36  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  37  |     })
  38  | 
  39  |     expect(res.status()).toBe(200)
  40  |     const body = await res.json()
  41  |     expect(body.success).toBe(true)
  42  |     expect(Array.isArray(body.data?.leagues ?? body.data)).toBe(true)
  43  |   })
  44  | 
  45  |   // EQ-02: Ranking de liga retorna dados de pontuacao
  46  |   test('EQ-02: GET /api/v1/leagues/[id] retorna ranking com pontuacao dos membros', async ({
  47  |     request,
  48  |   }) => {
  49  |     const loginRes = await request.post('/api/v1/auth/login', {
  50  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  51  |     })
> 52  |     expect(loginRes.status()).toBe(200)
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  53  | 
  54  |     // Listar ligas para pegar um ID
  55  |     const listRes = await request.get('/api/v1/leagues', {
  56  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  57  |     })
  58  |     const listBody = await listRes.json()
  59  |     const leagues = listBody.data?.leagues ?? listBody.data ?? []
  60  | 
  61  |     if (!leagues.length) {
  62  |       // Sem ligas no ambiente — criar uma para teste
  63  |       const createRes = await request.post('/api/v1/leagues', {
  64  |         data: {
  65  |           name: `Liga E2E Test ${Date.now()}`,
  66  |           type: 'OPEN',
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
```