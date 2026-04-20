# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-interactions.spec.ts >> ST004: Proteção de Rotas — Redirect sem sessão >> /inbox redireciona para / sem sessão
- Location: tests/e2e/ui-interactions.spec.ts:223:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 5000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:3000/inbox"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - link "Pular para o conteúdo" [ref=e3] [cursor=pointer]:
      - /url: "#main-content"
    - generic [ref=e4]:
      - banner [ref=e5]:
        - link "FootStock" [ref=e6] [cursor=pointer]:
          - /url: /mercado
          - img "FootStock" [ref=e7]
        - generic [ref=e8]:
          - 'status "Sessão: Negociação" [ref=e9]'
          - button "Notificações" [ref=e12]:
            - img [ref=e13]
      - main [ref=e16]:
        - generic [ref=e17]:
          - heading "Notificações" [level=1] [ref=e19]:
            - img [ref=e20]
            - text: Notificações
          - generic [ref=e23]:
            - img [ref=e25]
            - paragraph [ref=e28]: Nenhuma notificação ainda
            - paragraph [ref=e29]: As atividades da sua conta aparecerão aqui.
      - navigation "Navegação principal" [ref=e30]:
        - link "Mercado" [ref=e31] [cursor=pointer]:
          - /url: /mercado
          - img [ref=e32]
          - generic [ref=e35]: Mercado
        - link "Portfolio" [ref=e36] [cursor=pointer]:
          - /url: /portfolio
          - img [ref=e37]
          - generic [ref=e40]: Portfolio
        - link "Notícias" [ref=e41] [cursor=pointer]:
          - /url: /noticias
          - img [ref=e42]
          - generic [ref=e45]: Notícias
        - link "Ligas" [ref=e46] [cursor=pointer]:
          - /url: /ligas
          - img [ref=e47]
          - generic [ref=e53]: Ligas
        - button "Mais opções (inclui Glossário)" [ref=e54]:
          - img [ref=e55]
          - generic [ref=e59]: Mais
  - dialog "Consentimento de cookies" [ref=e60]:
    - generic [ref=e61]:
      - paragraph [ref=e62]:
        - text: Usamos cookies de analytics para melhorar sua experiência. Seus dados são pseudonimizados e nunca compartilhamos PII.
        - link "Política de Privacidade" [ref=e63] [cursor=pointer]:
          - /url: /privacidade
      - generic [ref=e64]:
        - button "Recusar" [ref=e65]
        - button "Aceitar" [ref=e66]
  - button "Mostrar data-testid overlays" [ref=e67]: "[data-test]"
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e73] [cursor=pointer]:
    - img [ref=e74]
  - alert [ref=e77]
```

# Test source

```ts
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
  164 |     await submitBtn.click()
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
> 225 |     await page.waitForURL(/\/$|\/login/, { timeout: 5000 })
      |                ^ TimeoutError: page.waitForURL: Timeout 5000ms exceeded.
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
  265 |     await page.goto('/mercado')
  266 |     await waitForNoSpinner(page)
  267 |   })
  268 | 
  269 |   test('NotificationBell renderiza no header quando autenticado', async ({ page }) => {
  270 |     const bellOrInbox = page.locator(
  271 |       '[data-testid="notification-bell"], [aria-label*="notificação"], [href="/inbox"]'
  272 |     ).first()
  273 |     // Pode ser bell icon ou link para /inbox
  274 |     const isVisible = await bellOrInbox.isVisible().catch(() => false)
  275 |     // NotificationBell ou link para inbox deve estar visível quando autenticado
  276 |     expect(isVisible).toBe(true)
  277 |   })
  278 | 
  279 |   test('/inbox carrega lista (vazia ou preenchida)', async ({ page }) => {
  280 |     await page.goto('/inbox')
  281 |     await page.waitForLoadState('networkidle')
  282 | 
  283 |     // Não deve ter erro 500
  284 |     await expect(page.locator('text=/500/i')).not.toBeVisible()
  285 | 
  286 |     // Deve ter lista ou estado vazio
  287 |     const content = await page.locator('main, [role="main"]').textContent().catch(() => '')
  288 |     expect(content).toBeTruthy()
  289 |   })
  290 | })
  291 | 
  292 | // ─── ST007: Assessor IA — Restrição de Plano ─────────────────────────────────
  293 | 
  294 | test.describe('ST007: Assessor IA — Restrição por Plano', () => {
  295 |   test('JOGADOR vê mensagem de upgrade ao acessar /assessor', async ({ page }) => {
  296 |     await loginAs(page, 'jogador')
  297 |     await page.goto('/assessor')
  298 |     await waitForNoSpinner(page)
  299 | 
  300 |     // Deve mostrar lock, paywall ou mensagem de upgrade
  301 |     const upgradeContent = page.locator(
  302 |       'text=/craque|lenda|upgrade|plano|assinar|bloqueado/i'
  303 |     ).first()
  304 |     const isVisible = await upgradeContent.isVisible().catch(() => false)
  305 |     // JOGADOR deve ver indicação de bloqueio/upgrade ao acessar assessor IA
  306 |     expect(isVisible).toBe(true)
  307 |   })
  308 | })
  309 | 
  310 | // ─── ST-MODAL: Zero Modais Quebrados — ESC, Backdrop, Botão X ────────────────
  311 | 
  312 | test.describe('ST-MODAL: Modais — ESC, Backdrop, Botão X (TASK-4 ST003)', () => {
  313 |   test.beforeEach(async ({ page }) => {
  314 |     await loginAs(page, 'craque')
  315 |   })
  316 | 
  317 |   test('Modal de confirmação de ordem fecha com ESC', async ({ page }) => {
  318 |     await page.goto('/mercado/FLA')
  319 |     await waitForNoSpinner(page)
  320 | 
  321 |     // Tentar abrir modal de ordem (Comprar/Vender)
  322 |     const orderBtn = page.getByRole('button', { name: /comprar|vender|ordem/i }).first()
  323 |     if (await orderBtn.isVisible().catch(() => false)) {
  324 |       await orderBtn.click()
  325 |       // Verificar que modal/dialog apareceu
```