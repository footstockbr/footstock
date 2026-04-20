# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier1-affiliate.spec.ts >> T-001: Sistema de Afiliados — TIER 1 >> AF-07: /api/v1/affiliate/me sem codigo ativo retorna erro AFFILIATE_001
- Location: tests/e2e/tier1-affiliate.spec.ts:238:7

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
Call log:
  - → POST http://localhost:3000/api/v1/auth/login
    - user-agent: Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Mobile Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 63

```

# Test source

```ts
  142 |     await loginAs(page, 'craque')
  143 |     await page.goto('/perfil')
  144 |     await page.waitForLoadState('networkidle')
  145 | 
  146 |     // AffiliateCard deve estar visivel
  147 |     const affiliateCard = page.locator('[data-testid="affiliate-card"]')
  148 |     await expect(affiliateCard).toBeVisible({ timeout: 8_000 })
  149 | 
  150 |     // Codigo deve estar presente
  151 |     const codeEl = page.locator('[data-testid="affiliate-card-code"]')
  152 |     await expect(codeEl).toBeVisible()
  153 |     const codeText = await codeEl.textContent()
  154 |     expect(codeText?.trim().length).toBeGreaterThan(3)
  155 | 
  156 |     // Link de compartilhamento deve estar presente
  157 |     const linkEl = page.locator('[data-testid="affiliate-card-link"]')
  158 |     await expect(linkEl).toBeVisible()
  159 | 
  160 |     // Stats de indicados deve estar presente
  161 |     const referralsEl = page.locator('[data-testid="affiliate-card-referrals"]')
  162 |     await expect(referralsEl).toBeVisible()
  163 | 
  164 |     await expectNoServerError(page)
  165 |   })
  166 | 
  167 |   // AF-04b: Botao de copiar codigo funciona
  168 |   test('AF-04b: Botao copiar codigo atualiza estado apos clique', async ({ page }) => {
  169 |     await loginAs(page, 'craque')
  170 |     await page.goto('/perfil')
  171 |     await page.waitForLoadState('networkidle')
  172 | 
  173 |     const copyCodeBtn = page.locator('[data-testid="affiliate-card-copy-code-button"]')
  174 |     await expect(copyCodeBtn).toBeVisible({ timeout: 8_000 })
  175 |     await copyCodeBtn.click()
  176 | 
  177 |     // Deve mudar de estado (check icon ou texto diferente) apos copiar
  178 |     await page.waitForTimeout(300)
  179 |     // O botao deve ter feedback de copia (icone Check ou texto "Copiado")
  180 |     await expect(copyCodeBtn).toBeVisible()
  181 |   })
  182 | 
  183 |   // AF-05: Admin acessa modulo de afiliados
  184 |   test('AF-05: Admin acessa lista de afiliados com stats', async ({ page }) => {
  185 |     await loginAs(page, 'admin')
  186 |     await page.goto('/admin/afiliados')
  187 |     await page.waitForLoadState('networkidle')
  188 | 
  189 |     // Header da pagina de afiliados
  190 |     const header = page.locator('[data-testid="admin-afiliados-header"]')
  191 |     await expect(header).toBeVisible({ timeout: 8_000 })
  192 | 
  193 |     // Tabela de afiliados
  194 |     const table = page.locator('[data-testid="admin-afiliados-table"]')
  195 |     await expect(table).toBeVisible()
  196 | 
  197 |     // Stats gerais
  198 |     const stats = page.locator('[data-testid="admin-afiliados-stats"]')
  199 |     await expect(stats).toBeVisible()
  200 | 
  201 |     await expectNoServerError(page)
  202 |   })
  203 | 
  204 |   // AF-06: Admin pode gerar novo codigo de afiliado
  205 |   test('AF-06: Admin pode criar novo codigo de afiliado via modal', async ({ page }) => {
  206 |     await loginAs(page, 'admin')
  207 |     await page.goto('/admin/afiliados')
  208 |     await page.waitForLoadState('networkidle')
  209 | 
  210 |     // Abrir modal de novo afiliado
  211 |     const novoBtn = page.locator('[data-testid="admin-afiliados-novo-button"]')
  212 |     await expect(novoBtn).toBeVisible({ timeout: 8_000 })
  213 |     await novoBtn.click()
  214 | 
  215 |     const modal = page.locator('[data-testid="admin-afiliados-novo-modal"]')
  216 |     await expect(modal).toBeVisible({ timeout: 4_000 })
  217 | 
  218 |     // Preencher email
  219 |     const emailInput = page.locator('[data-testid="admin-afiliados-novo-email-input"]')
  220 |     await expect(emailInput).toBeVisible()
  221 |     await emailInput.fill(USERS.craque.email)
  222 | 
  223 |     // Preencher comissao
  224 |     const comissaoInput = page.locator('[data-testid="admin-afiliados-novo-comissao-input"]')
  225 |     if (await comissaoInput.isVisible()) {
  226 |       await comissaoInput.fill('100')
  227 |     }
  228 | 
  229 |     // Fechar sem submeter (nao criar dados desnecessarios)
  230 |     const cancelBtn = page.locator('[data-testid="admin-afiliados-novo-cancel-button"]')
  231 |     if (await cancelBtn.isVisible()) {
  232 |       await cancelBtn.click()
  233 |       await expect(modal).not.toBeVisible({ timeout: 3_000 })
  234 |     }
  235 |   })
  236 | 
  237 |   // AF-07: Endpoint /api/v1/affiliate/me sem codigo ativo retorna 403
  238 |   test('AF-07: /api/v1/affiliate/me sem codigo ativo retorna erro AFFILIATE_001', async ({
  239 |     request,
  240 |   }) => {
  241 |     // Usuario sem codigo de afiliado — usa jogador de teste basico
> 242 |     const loginRes = await request.post('/api/v1/auth/login', {
      |                                    ^ Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
  243 |       data: { email: USERS.jogador.email, password: USERS.jogador.password },
  244 |     })
  245 |     // Tenta acessar endpoint de afiliado (que exige codigo ativo)
  246 |     const meRes = await request.get('/api/v1/affiliate/me', {
  247 |       headers: loginRes.headers(),
  248 |     })
  249 |     // 403 ou 200 dependendo do status do usuario — o importante e nao ser 500
  250 |     expect(meRes.status()).not.toBe(500)
  251 |     const body = await meRes.json().catch(() => null)
  252 |     if (meRes.status() === 403) {
  253 |       expect(body?.error?.code).toBe('AFFILIATE_001')
  254 |     }
  255 |   })
  256 | })
  257 | 
```