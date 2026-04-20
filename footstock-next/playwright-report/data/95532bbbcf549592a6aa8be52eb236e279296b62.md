# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-flows.spec.ts >> F3: Portfolio e Ordens >> /planos carrega seleção de planos
- Location: tests/e2e/e2e-flows.spec.ts:207:7

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: /entrar|login/i }) resolved to 10 elements:
    1) <button type="submit" aria-busy="false" aria-disabled="false" data-testid="form-login-submit-button" class="inline-flex items-center justify-center font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] bg-[#F0B90B] text-[#0B0E11] hover:bg-[#FCD535] shadow-[0_8px_32px_rgba(240,185,11,.3)] h-12 px-6 text-base rounded-lg w-full mt-2">Entrar</button> aka getByTestId('form-login-submit-button')
    2) <button type="button" aria-label="Entrar como SUPER_ADMIN" class="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70">…</button> aka getByRole('button', { name: 'Entrar como SUPER_ADMIN' })
    3) <button type="button" aria-label="Entrar como ADMINISTRADOR" class="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70">…</button> aka getByRole('button', { name: 'Entrar como ADMINISTRADOR' })
    4) <button type="button" aria-label="Entrar como MONITOR" class="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70">…</button> aka getByRole('button', { name: 'Entrar como MONITOR' })
    5) <button type="button" aria-label="Entrar como EDITOR" class="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70">…</button> aka getByRole('button', { name: 'Entrar como EDITOR' })
    6) <button type="button" aria-label="Entrar como MODERADOR" class="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70">…</button> aka getByRole('button', { name: 'Entrar como MODERADOR' })
    7) <button type="button" aria-label="Entrar como CRAQUE" class="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70">…</button> aka getByRole('button', { name: 'Entrar como CRAQUE' })
    8) <button type="button" aria-label="Entrar como LENDA / AFILIADO" class="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70">…</button> aka getByRole('button', { name: 'Entrar como LENDA / AFILIADO' })
    9) <button type="button" aria-label="Entrar como JOGADOR" class="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70">…</button> aka getByRole('button', { name: 'Entrar como JOGADOR' })
    10) <button type="button" aria-label="Entrar como CLUB_PARTNER" class="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70">…</button> aka getByRole('button', { name: 'Entrar como CLUB_PARTNER' })

Call log:
  - waiting for getByRole('button', { name: /entrar|login/i })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - img "FootStock" [ref=e5]
        - heading "Entrar no FootStock" [level=1] [ref=e6]
        - paragraph [ref=e7]: O mercado do futebol brasileiro
      - generic [ref=e8]:
        - generic [ref=e9]:
          - generic [ref=e11]: Email
          - textbox "Email" [ref=e13]:
            - /placeholder: seu@email.com
            - text: craque@footstock.test
        - generic [ref=e14]:
          - generic [ref=e15]:
            - generic [ref=e17]: Senha
            - generic [ref=e18]:
              - textbox "Senha" [active] [ref=e19]:
                - /placeholder: ••••••••
                - text: TestCraque123!
              - button "Mostrar senha" [ref=e20]:
                - img [ref=e21]
          - link "Esqueci minha senha →" [ref=e25] [cursor=pointer]:
            - /url: /recuperar-senha
        - button "Entrar" [ref=e26]
      - paragraph [ref=e27]:
        - text: Não tem conta?
        - link "Criar conta" [ref=e28] [cursor=pointer]:
          - /url: /cadastro
      - generic [ref=e29]:
        - heading "Usuários de teste" [level=2] [ref=e31]
        - generic [ref=e32]:
          - button "Entrar como SUPER_ADMIN" [ref=e33]:
            - paragraph [ref=e34]: SUPER_ADMIN
            - paragraph [ref=e35]: "Login: superadmin@foot-stock.test"
            - paragraph [ref=e36]: "Senha: FootStock@Dev2026!"
            - paragraph [ref=e37]: Clique para entrar
          - button "Entrar como ADMINISTRADOR" [ref=e38]:
            - paragraph [ref=e39]: ADMINISTRADOR
            - paragraph [ref=e40]: "Login: admin@foot-stock.test"
            - paragraph [ref=e41]: "Senha: FootStock@Dev2026!"
            - paragraph [ref=e42]: Clique para entrar
          - button "Entrar como MONITOR" [ref=e43]:
            - paragraph [ref=e44]: MONITOR
            - paragraph [ref=e45]: "Login: monitor@foot-stock.test"
            - paragraph [ref=e46]: "Senha: FootStock@Dev2026!"
            - paragraph [ref=e47]: Clique para entrar
          - button "Entrar como EDITOR" [ref=e48]:
            - paragraph [ref=e49]: EDITOR
            - paragraph [ref=e50]: "Login: editor@foot-stock.test"
            - paragraph [ref=e51]: "Senha: FootStock@Dev2026!"
            - paragraph [ref=e52]: Clique para entrar
          - button "Entrar como MODERADOR" [ref=e53]:
            - paragraph [ref=e54]: MODERADOR
            - paragraph [ref=e55]: "Login: moderador@foot-stock.test"
            - paragraph [ref=e56]: "Senha: FootStock@Dev2026!"
            - paragraph [ref=e57]: Clique para entrar
          - button "Entrar como CRAQUE" [ref=e58]:
            - paragraph [ref=e59]: CRAQUE
            - paragraph [ref=e60]: "Login: craque@foot-stock.test"
            - paragraph [ref=e61]: "Senha: FootStock@Dev2026!"
            - paragraph [ref=e62]: Clique para entrar
          - button "Entrar como LENDA / AFILIADO" [ref=e63]:
            - paragraph [ref=e64]: LENDA / AFILIADO
            - paragraph [ref=e65]: "Login: lenda@foot-stock.test"
            - paragraph [ref=e66]: "Senha: FootStock@Dev2026!"
            - paragraph [ref=e67]: Clique para entrar
          - button "Entrar como JOGADOR" [ref=e68]:
            - paragraph [ref=e69]: JOGADOR
            - paragraph [ref=e70]: "Login: jogador@foot-stock.test"
            - paragraph [ref=e71]: "Senha: FootStock@Dev2026!"
            - paragraph [ref=e72]: Clique para entrar
          - button "Entrar como CLUB_PARTNER" [ref=e73]:
            - paragraph [ref=e74]: CLUB_PARTNER
            - paragraph [ref=e75]: "Login: clube-parceiro@foot-stock.test"
            - paragraph [ref=e76]: "Senha: FootStock@Dev2026!"
            - paragraph [ref=e77]: Clique para entrar
  - dialog "Consentimento de cookies" [ref=e78]:
    - generic [ref=e79]:
      - paragraph [ref=e80]:
        - text: Usamos cookies de analytics para melhorar sua experiência. Seus dados são pseudonimizados e nunca compartilhamos PII.
        - link "Política de Privacidade" [ref=e81] [cursor=pointer]:
          - /url: /privacidade
      - generic [ref=e82]:
        - button "Recusar" [ref=e83]
        - button "Aceitar" [ref=e84]
  - button "Mostrar data-testid overlays" [ref=e85]: "[data-test]"
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e91] [cursor=pointer]:
    - img [ref=e92]
  - alert [ref=e95]
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
> 53  |   await page.getByRole('button', { name: /entrar|login/i }).click()
      |                                                             ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: /entrar|login/i }) resolved to 10 elements:
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
  99  |     await page.goto('/cadastro')
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
```