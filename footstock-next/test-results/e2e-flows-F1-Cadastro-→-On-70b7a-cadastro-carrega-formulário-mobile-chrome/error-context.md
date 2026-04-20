# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-flows.spec.ts >> F1: Cadastro → Onboarding → Dashboard >> /cadastro carrega formulário
- Location: tests/e2e/e2e-flows.spec.ts:98:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/cadastro", waiting until "load"

```

# Test source

```ts
  1   | /**
  2   |  * TASK-5 — Fluxos E2E das 6 Jornadas Principais (ECU)
  3   |  * module-29-integration / Foot Stock
  4   |  *
  5   |  * Valida as 6 jornadas críticas do usuário end-to-end com Playwright:
  6   |  *   F1: Cadastro → Onboarding → Dashboard
  7   |  *   F2: Login → Compra de ativo (ordem a mercado)
  8   |  *   F3: Login → Upgrade de plano → Feature Craque
  9   |  *   F4: Login → Assessor IA
  10  |  *   F5: Login → Forum / Comunidade (post + like)
  11  |  *   F6: Login → Liga (visualização)
  12  |  *
  13  |  * PRÉ-REQUISITO:
  14  |  *   - npm install && npx playwright install --with-deps chromium
  15  |  *   - Banco populado com seed data (module-6/prisma/seeds)
  16  |  *   - Variáveis de ambiente: TEST_CRAQUE_EMAIL, TEST_CRAQUE_PASSWORD, etc.
  17  |  *
  18  |  * ECU verificados: ECU 1-6 (app lancável, navegação, zero órfãos, loading, toast, states)
  19  |  */
  20  | 
  21  | import { test, expect, type Page, type BrowserContext } from '@playwright/test'
  22  | 
  23  | // ─── Usuários de teste ────────────────────────────────────────────────────────
  24  | 
  25  | const USERS = {
  26  |   craque: {
  27  |     email: process.env.TEST_CRAQUE_EMAIL ?? 'craque@footstock.test',
  28  |     password: process.env.TEST_CRAQUE_PASSWORD ?? 'TestCraque123!',
  29  |     plan: 'CRAQUE',
  30  |   },
  31  |   jogador: {
  32  |     email: process.env.TEST_JOGADOR_EMAIL ?? 'jogador@footstock.test',
  33  |     password: process.env.TEST_JOGADOR_PASSWORD ?? 'TestJogador123!',
  34  |     plan: 'JOGADOR',
  35  |   },
  36  |   newUser: {
  37  |     email: `e2e_new_${Date.now()}@footstock.test`,
  38  |     password: 'TestNewUser123!',
  39  |     name: 'E2E Test User',
  40  |     cpf: '11122233396', // CPF válido para testes
  41  |   },
  42  | }
  43  | 
  44  | // ─── Helpers ──────────────────────────────────────────────────────────────────
  45  | 
  46  | async function loginAs(page: Page, userKey: keyof Pick<typeof USERS, 'craque' | 'jogador'>) {
  47  |   const user = USERS[userKey]
  48  |   await page.goto('/login')
  49  |   await page.waitForLoadState('networkidle')
  50  | 
  51  |   await page.getByLabel(/e-mail|email/i).first().fill(user.email)
  52  |   await page.getByLabel(/senha|password/i).first().fill(user.password)
  53  |   await page.getByRole('button', { name: /entrar|login/i }).click()
  54  |   await page.waitForURL(/mercado|onboarding/, { timeout: 12000 })
  55  | }
  56  | 
  57  | async function expectNoServerError(page: Page) {
  58  |   await expect(page.locator('text=/500|internal server error/i')).not.toBeVisible()
  59  | }
  60  | 
  61  | async function expectToastOrFeedback(page: Page, pattern: RegExp) {
  62  |   // Toast pode ser sonner, alert, ou div de feedback
  63  |   const feedbackLocator = page.locator(
  64  |     `[role="status"], [role="alert"], [data-sonner-toast], .toast`
  65  |   ).filter({ hasText: pattern })
  66  |   await expect(feedbackLocator.first()).toBeVisible({ timeout: 5000 }).catch(() => {
  67  |     // Aceita se feedback estiver em outro lugar (inline message, etc)
  68  |   })
  69  | }
  70  | 
  71  | // ─── F1: Cadastro → Onboarding → Dashboard (ECU 1) ───────────────────────────
  72  | 
  73  | test.describe('F1: Cadastro → Onboarding → Dashboard', () => {
  74  |   /**
  75  |    * ECU 1: App lançável do zero (splash → login → onboarding → dashboard)
  76  |    * US-001, US-002, US-003
  77  |    */
  78  | 
  79  |   test('Splash screen renderiza e redireciona para /login', async ({ page }) => {
  80  |     await page.goto('/')
  81  |     await page.waitForLoadState('networkidle')
  82  |     await expectNoServerError(page)
  83  | 
  84  |     // Deve ter CTA de login/cadastro ou redirecionar automaticamente
  85  |     const hasLoginLink = await page.getByRole('link', { name: /entrar|login/i }).count() > 0
  86  |     const hasRedirected = page.url().includes('/login')
  87  | 
  88  |     expect(hasLoginLink || hasRedirected).toBe(true)
  89  |   })
  90  | 
  91  |   test('/login carrega sem erro', async ({ page }) => {
  92  |     await page.goto('/login')
  93  |     await page.waitForLoadState('networkidle')
  94  |     await expectNoServerError(page)
  95  |     await expect(page.getByLabel(/e-mail|email/i).first()).toBeVisible()
  96  |   })
  97  | 
  98  |   test('/cadastro carrega formulário', async ({ page }) => {
> 99  |     await page.goto('/cadastro')
      |                ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  100 |     await page.waitForLoadState('networkidle')
  101 |     await expectNoServerError(page)
  102 |     await expect(page.locator('form').first()).toBeVisible()
  103 |   })
  104 | 
  105 |   test('Login com credenciais válidas leva para /mercado ou /onboarding', async ({ page }) => {
  106 |     await loginAs(page, 'craque')
  107 |     await expectNoServerError(page)
  108 | 
  109 |     const url = page.url()
  110 |     expect(url).toMatch(/mercado|onboarding/)
  111 |   })
  112 | 
  113 |   test('/onboarding carrega sem erro (se existir)', async ({ page }) => {
  114 |     await loginAs(page, 'craque')
  115 |     await page.goto('/onboarding')
  116 |     await page.waitForLoadState('networkidle')
  117 |     await expectNoServerError(page)
  118 |   })
  119 | })
  120 | 
  121 | // ─── F2: Login → Mercado → Visualização de Ativo (ECU 1-3) ──────────────────
  122 | 
  123 | test.describe('F2: Mercado — Lista e Detalhe de Ativo', () => {
  124 |   /**
  125 |    * ECU 2: Navegação funcional
  126 |    * ECU 3: Nenhum botão sem onClick / link sem destino
  127 |    * US-012, US-013
  128 |    */
  129 | 
  130 |   test.beforeEach(async ({ page }) => {
  131 |     await loginAs(page, 'craque')
  132 |   })
  133 | 
  134 |   test('/mercado carrega lista de ativos sem erro 500', async ({ page }) => {
  135 |     await page.goto('/mercado')
  136 |     await page.waitForLoadState('networkidle')
  137 |     await expectNoServerError(page)
  138 |   })
  139 | 
  140 |   test('Ativos têm links clicáveis para detalhe', async ({ page }) => {
  141 |     await page.goto('/mercado')
  142 |     await page.waitForLoadState('networkidle')
  143 | 
  144 |     // Verificar que links de ativos existem e têm href
  145 |     const assetLinks = page.locator('a[href*="/mercado/"], a[href*="/ativo/"]')
  146 |     const count = await assetLinks.count()
  147 | 
  148 |     if (count > 0) {
  149 |       const firstLink = assetLinks.first()
  150 |       const href = await firstLink.getAttribute('href')
  151 |       expect(href).toBeTruthy()
  152 |       expect(href).toMatch(/mercado\/|ativo\//)
  153 |     }
  154 |   })
  155 | 
  156 |   test('/mercado/FLA carrega detalhe sem erro 500', async ({ page }) => {
  157 |     await page.goto('/mercado/FLA')
  158 |     await page.waitForLoadState('networkidle')
  159 |     await expectNoServerError(page)
  160 |   })
  161 | 
  162 |   test('/mercado/TICKER_INVALIDO mostra estado de não encontrado', async ({ page }) => {
  163 |     await page.goto('/mercado/ASSET_INVALIDO_ZZZ')
  164 |     await page.waitForLoadState('networkidle')
  165 |     await expectNoServerError(page)
  166 |     // Não deve ter crash — deve mostrar 404 gracioso
  167 |   })
  168 | 
  169 |   test('Busca/filtro de ativos responde a input (sem crash)', async ({ page }) => {
  170 |     await page.goto('/mercado')
  171 |     await page.waitForLoadState('networkidle')
  172 | 
  173 |     const searchInput = page.getByPlaceholder(/buscar|pesquisar|search/i).first()
  174 |     if (await searchInput.isVisible()) {
  175 |       await searchInput.fill('FLA')
  176 |       await page.waitForLoadState('networkidle')
  177 |       await expectNoServerError(page)
  178 |     }
  179 |   })
  180 | })
  181 | 
  182 | // ─── F3: Login → Portfolio → Ordens (ECU 4-5) ────────────────────────────────
  183 | 
  184 | test.describe('F3: Portfolio e Ordens', () => {
  185 |   /**
  186 |    * ECU 4: Toda ação async tem loading indicator
  187 |    * ECU 5: Toda ação tem toast de sucesso/erro
  188 |    * US-007, US-008, US-011
  189 |    */
  190 | 
  191 |   test.beforeEach(async ({ page }) => {
  192 |     await loginAs(page, 'craque')
  193 |   })
  194 | 
  195 |   test('/portfolio carrega sem erro 500', async ({ page }) => {
  196 |     await page.goto('/portfolio')
  197 |     await page.waitForLoadState('networkidle')
  198 |     await expectNoServerError(page)
  199 |   })
```