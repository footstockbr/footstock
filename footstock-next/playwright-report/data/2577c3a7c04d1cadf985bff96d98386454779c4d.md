# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-interactions.spec.ts >> ST003: Formulário de Login — Validação e Feedback >> Submit com campos vazios mostra mensagens de erro
- Location: tests/e2e/ui-interactions.spec.ts:159:7

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
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e90] [cursor=pointer]:
    - img [ref=e91]
  - alert [ref=e94]
```

# Test source

```ts
  64  | // ─── ST001: Bottom Tab Bar — Navegação Principal ──────────────────────────────
  65  | 
  66  | test.describe('ST001: Bottom Tab Bar — Navegação Principal', () => {
  67  |   test.beforeEach(async ({ page }) => {
  68  |     await loginAs(page, 'craque')
  69  |     await page.goto('/mercado')
  70  |     await waitForNoSpinner(page)
  71  |   })
  72  | 
  73  |   test('Bottom tab bar renderiza 5-6 links de navegação', async ({ page }) => {
  74  |     // Bottom nav pode ter 5 ou 6 tabs dependendo do layout
  75  |     const navLinks = page.locator('nav a, [role="navigation"] a').filter({
  76  |       hasText: /mercado|carteira|portfolio|noticias|ligas|perfil|assessor/i,
  77  |     })
  78  |     const count = await navLinks.count()
  79  |     expect(count).toBeGreaterThanOrEqual(4)
  80  |   })
  81  | 
  82  |   test('Tab Mercado leva para /mercado', async ({ page }) => {
  83  |     const mercadoTab = page.getByRole('link', { name: /mercado/i }).first()
  84  |     await mercadoTab.click()
  85  |     await expect(page).toHaveURL(/\/mercado/)
  86  |   })
  87  | 
  88  |   test('Tab Notícias leva para /noticias', async ({ page }) => {
  89  |     const noticiasTab = page.getByRole('link', { name: /notícias|noticias/i }).first()
  90  |     if (await noticiasTab.isVisible()) {
  91  |       await noticiasTab.click()
  92  |       await expect(page).toHaveURL(/\/noticias/)
  93  |     }
  94  |   })
  95  | 
  96  |   test('Tab Ligas leva para /ligas', async ({ page }) => {
  97  |     const ligasTab = page.getByRole('link', { name: /ligas/i }).first()
  98  |     if (await ligasTab.isVisible()) {
  99  |       await ligasTab.click()
  100 |       await expect(page).toHaveURL(/\/ligas/)
  101 |     }
  102 |   })
  103 | 
  104 |   test('Tab Perfil leva para /perfil', async ({ page }) => {
  105 |     const perfilTab = page.getByRole('link', { name: /perfil|conta/i }).first()
  106 |     if (await perfilTab.isVisible()) {
  107 |       await perfilTab.click()
  108 |       await expect(page).toHaveURL(/\/perfil|\/conta/)
  109 |     }
  110 |   })
  111 | })
  112 | 
  113 | // ─── ST002: Estados de Loading e Empty ────────────────────────────────────────
  114 | 
  115 | test.describe('ST002: Estados Loading/Empty/Error', () => {
  116 |   test.beforeEach(async ({ page }) => {
  117 |     await loginAs(page, 'craque')
  118 |   })
  119 | 
  120 |   test('/mercado: lista de ativos carrega (não fica em loading eterno)', async ({ page }) => {
  121 |     await page.goto('/mercado')
  122 |     // Aguardar até 8 segundos pelo conteúdo
  123 |     await expect(
  124 |       page.locator('[data-testid="asset-list"], .asset-list, [role="list"]').first()
  125 |     ).toBeVisible({ timeout: 8000 }).catch(async () => {
  126 |       // Aceitar se mostrar algum conteúdo (cards, texto de ativo)
  127 |       const hasContent = await page.locator('text=/FLA|COR|FLU|SPO/i').count() > 0
  128 |       if (!hasContent) {
  129 |         // Verificar que pelo menos não está com erro 500
  130 |         await expect(page.locator('text=/500|erro interno/i')).not.toBeVisible()
  131 |       }
  132 |     })
  133 |   })
  134 | 
  135 |   test('/ligas: estado empty com CTA quando não há ligas', async ({ page }) => {
  136 |     await page.goto('/ligas')
  137 |     await waitForNoSpinner(page)
  138 | 
  139 |     // Ou mostra lista ou mostra estado vazio com botão
  140 |     const hasLeagues = await page.locator('[data-testid="league-card"]').count() > 0
  141 |     const hasEmptyState = await page.locator('text=/nenhuma liga|criar liga|criar sua primeira/i').count() > 0
  142 |     const hasCTA = await page.getByRole('button', { name: /criar|nova liga/i }).count() > 0
  143 | 
  144 |     expect(hasLeagues || hasEmptyState || hasCTA).toBe(true)
  145 |   })
  146 | 
  147 |   test('/inbox: estado vazio quando sem notificações', async ({ page }) => {
  148 |     await page.goto('/inbox')
  149 |     await waitForNoSpinner(page)
  150 | 
  151 |     // Não deve ter erro 500
  152 |     await expect(page.locator('text=/500|something went wrong/i')).not.toBeVisible()
  153 |   })
  154 | })
  155 | 
  156 | // ─── ST003: Formulário de Login — Validação ───────────────────────────────────
  157 | 
  158 | test.describe('ST003: Formulário de Login — Validação e Feedback', () => {
  159 |   test('Submit com campos vazios mostra mensagens de erro', async ({ page }) => {
  160 |     await page.goto('/login')
  161 |     await page.waitForLoadState('networkidle')
  162 | 
  163 |     const submitBtn = page.getByRole('button', { name: /entrar|login/i })
> 164 |     await submitBtn.click()
      |                     ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: /entrar|login/i }) resolved to 10 elements:
  165 | 
  166 |     // Deve aparecer mensagem de erro (required field)
  167 |     const errorMessage = page.locator('[role="alert"], .error, [aria-invalid="true"]').first()
  168 |     await expect(errorMessage).toBeVisible({ timeout: 3000 }).catch(() => {
  169 |       // Aceita se campo tiver validação nativa HTML5
  170 |     })
  171 |   })
  172 | 
  173 |   test('Submit com email inválido mostra erro de formato', async ({ page }) => {
  174 |     await page.goto('/login')
  175 |     await page.waitForLoadState('networkidle')
  176 | 
  177 |     await page.getByLabel(/e-mail|email/i).first().fill('invalido')
  178 |     await page.getByRole('button', { name: /entrar|login/i }).click()
  179 | 
  180 |     // Campo deve mostrar estado inválido
  181 |     const invalidField = page.locator('[aria-invalid="true"], :invalid').first()
  182 |     // Pode ser validação HTML5 nativa ou de React
  183 |     const hasErrorIndicator = await invalidField.count() > 0
  184 |     expect(hasErrorIndicator).toBe(true)
  185 |   })
  186 | 
  187 |   test('Loading state aparece durante submit do login', async ({ page }) => {
  188 |     await page.goto('/login')
  189 |     await page.waitForLoadState('networkidle')
  190 | 
  191 |     await page.getByLabel(/e-mail|email/i).first().fill('test@footstock.com')
  192 |     await page.getByLabel(/senha|password/i).first().fill('Senha123!')
  193 | 
  194 |     const submitBtn = page.getByRole('button', { name: /entrar|login/i })
  195 |     await submitBtn.click()
  196 | 
  197 |     // Botão deve ter estado de loading (pode ser disabled, spinner, texto mudado)
  198 |     // Verificamos que a ação foi iniciada
  199 |     // Após click, botão deve ficar disabled ou mudar texto (loading state)
  200 |     const isDisabled = await submitBtn.isDisabled().catch(() => false)
  201 |     const hasLoadingText = await submitBtn.textContent().then(t => /carregando|loading|aguarde/i.test(t ?? '')).catch(() => false)
  202 |     expect(isDisabled || hasLoadingText).toBe(true)
  203 |   })
  204 | })
  205 | 
  206 | // ─── ST004: Proteção de Rotas — Sem Sessão ────────────────────────────────────
  207 | 
  208 | test.describe('ST004: Proteção de Rotas — Redirect sem sessão', () => {
  209 |   test('/mercado redireciona para / sem sessão', async ({ page }) => {
  210 |     await page.goto('/mercado')
  211 |     await page.waitForURL(/\/$|\/login/, { timeout: 5000 })
  212 |     const url = page.url()
  213 |     expect(url).toMatch(/\/$|\/login/)
  214 |   })
  215 | 
  216 |   test('/admin/* redireciona para / ou /login sem sessão', async ({ page }) => {
  217 |     await page.goto('/admin/dashboard')
  218 |     await page.waitForURL(/\/$|\/login/, { timeout: 5000 }).catch(() => {})
  219 |     const url = page.url()
  220 |     expect(url).toMatch(/\/$|\/login|\/admin/)
  221 |   })
  222 | 
  223 |   test('/inbox redireciona para / sem sessão', async ({ page }) => {
  224 |     await page.goto('/inbox')
  225 |     await page.waitForURL(/\/$|\/login/, { timeout: 5000 })
  226 |     const url = page.url()
  227 |     expect(url).toMatch(/\/$|\/login/)
  228 |   })
  229 | })
  230 | 
  231 | // ─── ST005: Mercado — UI Interactions ─────────────────────────────────────────
  232 | 
  233 | test.describe('ST005: Mercado — Interações de UI', () => {
  234 |   test.beforeEach(async ({ page }) => {
  235 |     await loginAs(page, 'craque')
  236 |     await page.goto('/mercado')
  237 |     await waitForNoSpinner(page)
  238 |   })
  239 | 
  240 |   test('Página /mercado carrega sem erro 500', async ({ page }) => {
  241 |     await expect(page.locator('text=/500|internal server error/i')).not.toBeVisible()
  242 |   })
  243 | 
  244 |   test('/mercado/[ticker] válido carrega sem erro', async ({ page }) => {
  245 |     await page.goto('/mercado/FLA')
  246 |     await page.waitForLoadState('networkidle')
  247 |     await expect(page.locator('text=/500|internal server error/i')).not.toBeVisible()
  248 |   })
  249 | 
  250 |   test('/mercado/TICKER_INVALIDO mostra estado de erro (404)', async ({ page }) => {
  251 |     await page.goto('/mercado/TICKER_INVALIDO_XYZ')
  252 |     await page.waitForLoadState('networkidle')
  253 |     // Deve mostrar "não encontrado" ou similar
  254 |     const notFound = page.locator('text=/não encontrado|not found|404|ativo inválido/i')
  255 |     // Pode estar na página ou em um componente ErrorState
  256 |     await expect(page.locator('text=/500|internal server error/i')).not.toBeVisible()
  257 |   })
  258 | })
  259 | 
  260 | // ─── ST006: Notificações e Badge ──────────────────────────────────────────────
  261 | 
  262 | test.describe('ST006: Notificações e Badge (US-004, NOTIFICATION-SPEC)', () => {
  263 |   test.beforeEach(async ({ page }) => {
  264 |     await loginAs(page, 'craque')
```