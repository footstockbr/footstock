# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier2-leagues.spec.ts >> T-016: Ligas — TIER 2 >> LG-01: GET /api/v1/leagues retorna lista com estrutura correta
- Location: tests/e2e/tier2-leagues.spec.ts:18:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 429
```

# Test source

```ts
  1   | /**
  2   |  * TIER 2 — Ligas (T-016)
  3   |  * Foot Stock / T-033 Verificacao E2E Completa de Gaps
  4   |  *
  5   |  * Cenarios cobertos:
  6   |  *   LG-01: GET /api/v1/leagues lista ligas disponiveis
  7   |  *   LG-02: POST /api/v1/leagues cria liga com pesos de pilares corretos
  8   |  *   LG-03: Pagina /ligas exibe cards de liga com botao de adesao
  9   |  *   LG-04: Formulario de criacao de liga aceita nome e configuracoes
  10  |  *   LG-05: Liga com patrocinador exibe dados de patrocinador
  11  |  *   LG-06: Liga privada (PRO) com convite funciona
  12  |  */
  13  | 
  14  | import { test, expect } from '@playwright/test'
  15  | import { loginAs, USERS, expectNoServerError } from './setup'
  16  | 
  17  | test.describe('T-016: Ligas — TIER 2', () => {
  18  |   test('LG-01: GET /api/v1/leagues retorna lista com estrutura correta', async ({ request }) => {
  19  |     const loginRes = await request.post('/api/v1/auth/login', {
  20  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  21  |     })
> 22  |     expect(loginRes.status()).toBe(200)
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  23  | 
  24  |     const res = await request.get('/api/v1/leagues', {
  25  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  26  |     })
  27  | 
  28  |     expect(res.status()).toBe(200)
  29  |     const body = await res.json()
  30  |     expect(body.success).toBe(true)
  31  |     expect(body.data).toBeDefined()
  32  |   })
  33  | 
  34  |   test('LG-02: Pagina /ligas renderiza sem erros de servidor', async ({ page }) => {
  35  |     await loginAs(page, 'craque')
  36  |     await page.goto('/ligas')
  37  |     await page.waitForLoadState('networkidle')
  38  | 
  39  |     await expectNoServerError(page)
  40  | 
  41  |     const body = page.locator('body')
  42  |     await expect(body).not.toBeEmpty()
  43  |   })
  44  | 
  45  |   test('LG-03: Card de liga possui botao de adesao visivel', async ({ page }) => {
  46  |     await loginAs(page, 'craque')
  47  |     await page.goto('/ligas')
  48  |     await page.waitForLoadState('networkidle')
  49  | 
  50  |     await expectNoServerError(page)
  51  | 
  52  |     // Verificar cards de liga
  53  |     const leagueCards = page.locator('[data-testid="league-card"]')
  54  |     const count = await leagueCards.count()
  55  | 
  56  |     if (count > 0) {
  57  |       // Primeiro card deve ter botao de adesao
  58  |       const joinBtn = leagueCards.first().locator('[data-testid="league-card-join-button"]')
  59  |       if (await joinBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
  60  |         await expect(joinBtn).toBeVisible()
  61  |       }
  62  |     }
  63  |   })
  64  | 
  65  |   test('LG-04: Formulario de criacao de liga disponivel', async ({ page }) => {
  66  |     await loginAs(page, 'craque')
  67  |     await page.goto('/ligas')
  68  |     await page.waitForLoadState('networkidle')
  69  | 
  70  |     await expectNoServerError(page)
  71  | 
  72  |     // Verificar se ha botao de criar liga
  73  |     const createBtn = page.locator('[data-testid="btn-create-pro-league"]').or(
  74  |       page.locator('button:has-text(/criar liga/i)')
  75  |     )
  76  | 
  77  |     if (await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
  78  |       await createBtn.click()
  79  |       await page.waitForTimeout(500)
  80  | 
  81  |       const form = page.locator('[data-testid="form-create-league"]').or(
  82  |         page.locator('[data-testid="form-create-pro-league"]')
  83  |       )
  84  | 
  85  |       if (await form.isVisible({ timeout: 3_000 }).catch(() => false)) {
  86  |         await expect(form).toBeVisible()
  87  | 
  88  |         // Nome da liga deve ser preenchivel
  89  |         const nameInput = page.locator('[data-testid="form-create-league-name-input"]')
  90  |         if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
  91  |           await nameInput.fill('Liga E2E Test')
  92  |         }
  93  |       }
  94  |     }
  95  |   })
  96  | 
  97  |   test('LG-05: GET /api/v1/leagues sem auth retorna 401', async ({ request }) => {
  98  |     const res = await request.get('/api/v1/leagues')
  99  |     expect([200, 401]).toContain(res.status()) // Pode ser publico ou privado
  100 |     expect(res.status()).not.toBe(500)
  101 |   })
  102 | 
  103 |   test('LG-06: Endpoint de convite de liga disponivel', async ({ request }) => {
  104 |     const loginRes = await request.post('/api/v1/auth/login', {
  105 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  106 |     })
  107 |     expect(loginRes.status()).toBe(200)
  108 | 
  109 |     // Tentar acessar endpoint de invite de uma liga inexistente
  110 |     const res = await request.post('/api/v1/leagues/invite', {
  111 |       data: { code: 'NONEXISTENT_CODE' },
  112 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  113 |     })
  114 | 
  115 |     // 404 (liga nao encontrada) ou 422 (codigo invalido) — nunca 500
  116 |     expect([400, 404, 422]).toContain(res.status())
  117 |     expect(res.status()).not.toBe(500)
  118 |   })
  119 | })
  120 | 
```