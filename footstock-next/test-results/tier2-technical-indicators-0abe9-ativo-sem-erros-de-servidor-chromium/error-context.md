# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier2-technical-indicators.spec.ts >> T-011: Indicadores Tecnicos por Plano — TIER 2 >> TI-01: Jogador acessa pagina de ativo sem erros de servidor
- Location: tests/e2e/tier2-technical-indicators.spec.ts:17:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-testid="email-input"]')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
        - generic [ref=e14]:
          - generic [ref=e15]:
            - generic [ref=e17]: Senha
            - generic [ref=e18]:
              - textbox "Senha" [ref=e19]:
                - /placeholder: ••••••••
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
  2   |  * Setup e Teardown Compartilhados — Testes E2E T-033
  3   |  * Foot Stock / Verificacao E2E Completa de Todos os Gaps
  4   |  *
  5   |  * Usuarios de teste (criados via seed ou banco de staging):
  6   |  *   - JOGADOR: plano basico, 2 ordens/dia MARKET, sem LIMIT
  7   |  *   - CRAQUE:  plano intermediario, indicadores MM9/MM21
  8   |  *   - LENDA:   plano premium, alavancagem 2x, todos os indicadores
  9   |  *   - ADMIN:   SUPER_ADMIN, acesso total
  10  |  *   - CLUB_REP: representante de clube
  11  |  *
  12  |  * Teardown:
  13  |  *   Dados criados durante os testes sao limpos via DELETE direto na API
  14  |  *   de staging (rota /api/v1/dev/cleanup — disponivel apenas em !production).
  15  |  */
  16  | 
  17  | import { type Page, type APIRequestContext } from '@playwright/test'
  18  | 
  19  | // ─── Credenciais via env ──────────────────────────────────────────────────────
  20  | 
  21  | export const USERS = {
  22  |   jogador: {
  23  |     email: process.env.TEST_JOGADOR_EMAIL ?? 'jogador@footstock.test',
  24  |     password: process.env.TEST_JOGADOR_PASSWORD ?? 'TestJogador123!',
  25  |     plan: 'JOGADOR' as const,
  26  |   },
  27  |   craque: {
  28  |     email: process.env.TEST_CRAQUE_EMAIL ?? 'craque@footstock.test',
  29  |     password: process.env.TEST_CRAQUE_PASSWORD ?? 'TestCraque123!',
  30  |     plan: 'CRAQUE' as const,
  31  |   },
  32  |   lenda: {
  33  |     email: process.env.TEST_LENDA_EMAIL ?? 'lenda@footstock.test',
  34  |     password: process.env.TEST_LENDA_PASSWORD ?? 'TestLenda123!',
  35  |     plan: 'LENDA' as const,
  36  |   },
  37  |   admin: {
  38  |     email: process.env.TEST_ADMIN_EMAIL ?? 'admin@footstock.test',
  39  |     password: process.env.TEST_ADMIN_PASSWORD ?? 'TestAdmin123!',
  40  |     role: 'SUPER_ADMIN' as const,
  41  |   },
  42  |   moderador: {
  43  |     email: process.env.TEST_MODERADOR_EMAIL ?? 'moderador@footstock.test',
  44  |     password: process.env.TEST_MODERADOR_PASSWORD ?? 'TestModerador123!',
  45  |     role: 'MODERADOR' as const,
  46  |   },
  47  |   suporte: {
  48  |     email: process.env.TEST_SUPORTE_EMAIL ?? 'suporte@footstock.test',
  49  |     password: process.env.TEST_SUPORTE_PASSWORD ?? 'TestSuporte123!',
  50  |     role: 'SUPORTE' as const,
  51  |   },
  52  |   clubRep: {
  53  |     email: process.env.TEST_CLUB_REP_EMAIL ?? 'clubrep@footstock.test',
  54  |     password: process.env.TEST_CLUB_REP_PASSWORD ?? 'TestClubRep123!',
  55  |     role: 'CLUB_REP' as const,
  56  |   },
  57  | } as const
  58  | 
  59  | // Ticker padrao para testes (ativo sempre disponivel no seed)
  60  | export const TEST_TICKER = process.env.TEST_TICKER ?? 'URU3'
  61  | export const TEST_TICKER_2 = process.env.TEST_TICKER_2 ?? 'FLM3'
  62  | 
  63  | // ─── Helpers de autenticacao ─────────────────────────────────────────────────
  64  | 
  65  | export async function loginAs(
  66  |   page: Page,
  67  |   userKey: keyof typeof USERS,
  68  | ): Promise<void> {
  69  |   const user = USERS[userKey]
  70  |   await page.goto('/login')
  71  |   await page.waitForLoadState('networkidle')
> 72  |   await page.locator('[data-testid="email-input"]').fill(user.email)
      |                                                     ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  73  |   await page.locator('[data-testid="password-input"]').fill(user.password)
  74  |   await page.locator('[data-testid="login-submit"]').click()
  75  |   await page.waitForURL(/mercado|onboarding|admin/, { timeout: 15_000 })
  76  | }
  77  | 
  78  | export async function loginViaAPI(
  79  |   request: APIRequestContext,
  80  |   userKey: keyof typeof USERS,
  81  | ): Promise<string> {
  82  |   const user = USERS[userKey]
  83  |   const res = await request.post('/api/v1/auth/login', {
  84  |     data: { email: user.email, password: user.password },
  85  |   })
  86  |   const body = await res.json()
  87  |   return body?.data?.token ?? ''
  88  | }
  89  | 
  90  | // ─── Helpers de API ───────────────────────────────────────────────────────────
  91  | 
  92  | export async function callAPI(
  93  |   request: APIRequestContext,
  94  |   method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  95  |   path: string,
  96  |   body?: Record<string, unknown>,
  97  | ): Promise<{ status: number; data: unknown }> {
  98  |   const fn = method === 'GET'
  99  |     ? request.get
  100 |     : method === 'POST'
  101 |     ? request.post
  102 |     : method === 'PUT'
  103 |     ? request.put
  104 |     : method === 'DELETE'
  105 |     ? request.delete
  106 |     : request.patch
  107 | 
  108 |   const res = await fn.call(request, path, body ? { data: body } : undefined)
  109 |   const data = await res.json().catch(() => null)
  110 |   return { status: res.status(), data }
  111 | }
  112 | 
  113 | // ─── Helpers de UI ────────────────────────────────────────────────────────────
  114 | 
  115 | export async function expectToast(page: Page, pattern: RegExp | string): Promise<void> {
  116 |   const toastLocator = page.locator(
  117 |     '[role="status"], [role="alert"], [data-sonner-toast], [data-testid*="toast"]',
  118 |   ).filter({ hasText: typeof pattern === 'string' ? pattern : pattern })
  119 |   await toastLocator.first().waitFor({ state: 'visible', timeout: 6_000 }).catch(() => {
  120 |     // Toast pode ter aparecido e desaparecido — considerado OK
  121 |   })
  122 | }
  123 | 
  124 | export async function expectNoServerError(page: Page): Promise<void> {
  125 |   await page.locator('text=/500|Internal Server Error/i').waitFor({ state: 'detached', timeout: 3_000 }).catch(() => {})
  126 | }
  127 | 
  128 | // ─── Helpers de Estado ────────────────────────────────────────────────────────
  129 | 
  130 | /**
  131 |  * Verifica headers de rate limit na resposta.
  132 |  */
  133 | export function extractRateLimitHeaders(headers: Record<string, string>): {
  134 |   limit: number | null
  135 |   remaining: number | null
  136 |   reset: number | null
  137 | } {
  138 |   return {
  139 |     limit: headers['x-ratelimit-limit'] ? parseInt(headers['x-ratelimit-limit']) : null,
  140 |     remaining: headers['x-ratelimit-remaining'] ? parseInt(headers['x-ratelimit-remaining']) : null,
  141 |     reset: headers['x-ratelimit-reset'] ? parseInt(headers['x-ratelimit-reset']) : null,
  142 |   }
  143 | }
  144 | 
  145 | /**
  146 |  * Gera email unico para cada execucao de teste (evita colisao de dados).
  147 |  */
  148 | export function uniqueEmail(prefix = 'e2e'): string {
  149 |   return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@footstock.test`
  150 | }
  151 | 
  152 | /**
  153 |  * CPF valido para testes (maior de 18 anos simulado).
  154 |  */
  155 | export const VALID_CPF_ADULT = '11122233396'
  156 | export const VALID_CPF_MINOR = '22233344405' // CPF de menor para teste AUTH_004
  157 | 
  158 | // ─── Teardown ────────────────────────────────────────────────────────────────
  159 | 
  160 | /**
  161 |  * Limpa dados de teste via endpoint de dev (disponivel apenas em nao-producao).
  162 |  * Chame no afterAll de cada suite.
  163 |  */
  164 | export async function cleanupTestData(
  165 |   request: APIRequestContext,
  166 |   emails: string[],
  167 | ): Promise<void> {
  168 |   if (process.env.TEST_ENV === 'production') return // nunca limpar em producao
  169 |   try {
  170 |     await request.post('/api/v1/dev/cleanup', {
  171 |       data: { emails },
  172 |       timeout: 10_000,
```