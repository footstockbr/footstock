# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-interactions.spec.ts >> ST004: Proteção de Rotas — Redirect sem sessão >> /mercado redireciona para / sem sessão
- Location: tests/e2e/ui-interactions.spec.ts:209:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 5000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:3000/mercado"
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
          - link "Visitar Mercado Pago" [ref=e19] [cursor=pointer]:
            - /url: https://www.mercadopago.com.br
            - generic [ref=e21]:
              - generic [ref=e23]:
                - generic [ref=e24]: Mercado Pago acelera seus aportes
                - generic [ref=e25]: Mercado Pago
              - generic [ref=e26]: Abrir conta
          - generic [ref=e27]:
            - generic [ref=e28]:
              - generic [ref=e29]: Sessão atual
              - 'status "Sessão de mercado: Negociação, próxima transição em 18h 19min" [ref=e30]':
                - generic [ref=e32]: Negociação
                - generic [ref=e33]: em 18h 19min
            - generic [ref=e35]:
              - img [ref=e36]
              - searchbox "Buscar clube ou ticker" [ref=e39]
            - generic [ref=e40]:
              - group "Filtrar por divisao" [ref=e41]:
                - generic [ref=e42]: Filtrar por divisao
                - generic [ref=e43]:
                  - button "Serie A" [ref=e44]
                  - button "Serie B" [ref=e45]
              - group "Filtrar por sentimento" [ref=e46]:
                - generic [ref=e47]: Filtrar por sentimento
                - generic [ref=e48]:
                  - button "Positivo" [ref=e49]
                  - button "Neutro" [ref=e50]
                  - button "Negativo" [ref=e51]
            - generic [ref=e52]:
              - generic [ref=e53]: 🔍
              - paragraph [ref=e54]: Nenhum ativo encontrado
              - paragraph [ref=e55]: Tente ajustar os filtros ou limpar a busca.
              - button "Limpar filtros" [ref=e56]
          - generic [ref=e62]:
            - generic [ref=e64]: FS
            - generic [ref=e65]:
              - text: FootStock
              - generic [ref=e66]: Simule. Negocie. Domine o mercado.
      - navigation "Navegação principal" [ref=e67]:
        - link "Mercado" [ref=e68] [cursor=pointer]:
          - /url: /mercado
          - img [ref=e69]
          - generic [ref=e72]: Mercado
        - link "Portfolio" [ref=e73] [cursor=pointer]:
          - /url: /portfolio
          - img [ref=e74]
          - generic [ref=e77]: Portfolio
        - link "Notícias" [ref=e78] [cursor=pointer]:
          - /url: /noticias
          - img [ref=e79]
          - generic [ref=e82]: Notícias
        - link "Ligas" [ref=e83] [cursor=pointer]:
          - /url: /ligas
          - img [ref=e84]
          - generic [ref=e90]: Ligas
        - button "Mais opções (inclui Glossário)" [ref=e91]:
          - img [ref=e92]
          - generic [ref=e96]: Mais
  - dialog "Consentimento de cookies" [ref=e97]:
    - generic [ref=e98]:
      - paragraph [ref=e99]:
        - text: Usamos cookies de analytics para melhorar sua experiência. Seus dados são pseudonimizados e nunca compartilhamos PII.
        - link "Política de Privacidade" [ref=e100] [cursor=pointer]:
          - /url: /privacidade
      - generic [ref=e101]:
        - button "Recusar" [ref=e102]
        - button "Aceitar" [ref=e103]
  - button "Mostrar data-testid overlays" [ref=e104]: "[data-test]"
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e110] [cursor=pointer]:
    - generic [ref=e113]:
      - text: Compiling
      - generic [ref=e114]:
        - generic [ref=e115]: .
        - generic [ref=e116]: .
        - generic [ref=e117]: .
  - alert [ref=e118]
```

# Test source

```ts
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
> 211 |     await page.waitForURL(/\/$|\/login/, { timeout: 5000 })
      |                ^ TimeoutError: page.waitForURL: Timeout 5000ms exceeded.
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
```