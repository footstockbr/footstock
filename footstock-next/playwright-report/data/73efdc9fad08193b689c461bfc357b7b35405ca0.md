# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier1-affiliate.spec.ts >> T-001: Sistema de Afiliados — TIER 1 >> AF-03: Novo usuario registrado via link afiliado tem referredBy no banco
- Location: tests/e2e/tier1-affiliate.spec.ts:92:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 201
Received: 400
```

# Test source

```ts
  29  | } from './setup'
  30  | 
  31  | const VALID_AFFILIATE_CODE = process.env.TEST_AFFILIATE_CODE ?? 'PEDRO100'
  32  | const createdEmails: string[] = []
  33  | 
  34  | test.describe('T-001: Sistema de Afiliados — TIER 1', () => {
  35  |   test.afterAll(async ({ request }) => {
  36  |     await cleanupTestData(request, createdEmails)
  37  |   })
  38  | 
  39  |   // AF-01: Pagina /ref/{codigo} valido — cookie + redirect
  40  |   test('AF-01: /ref/[codigo] valido salva cookie fs_ref e redireciona para /cadastro', async ({
  41  |     page,
  42  |     context,
  43  |   }) => {
  44  |     await page.goto(`/ref/${VALID_AFFILIATE_CODE}`)
  45  |     await page.waitForURL(/cadastro/, { timeout: 8_000 })
  46  | 
  47  |     // Verificar que o cookie fs_ref foi definido
  48  |     const cookies = await context.cookies()
  49  |     const fsCookie = cookies.find((c) => c.name === 'fs_ref')
  50  |     expect(fsCookie, 'Cookie fs_ref deve existir').toBeTruthy()
  51  |     expect(fsCookie?.value.toUpperCase()).toBe(VALID_AFFILIATE_CODE.toUpperCase())
  52  |     expect(fsCookie?.httpOnly).toBe(false) // deve ser lido pelo JS client
  53  | 
  54  |     // URL de cadastro deve conter o ref como query param (fallback duplo)
  55  |     expect(page.url()).toContain(`ref=${VALID_AFFILIATE_CODE.toUpperCase()}`)
  56  | 
  57  |     await expectNoServerError(page)
  58  |   })
  59  | 
  60  |   // AF-01b: Case-insensitive na URL
  61  |   test('AF-01b: /ref/[codigo] e case-insensitive — minusculas normalizam para maiusculas', async ({
  62  |     page,
  63  |     context,
  64  |   }) => {
  65  |     const lowerCode = VALID_AFFILIATE_CODE.toLowerCase()
  66  |     await page.goto(`/ref/${lowerCode}`)
  67  |     await page.waitForURL(/cadastro/, { timeout: 8_000 })
  68  | 
  69  |     const cookies = await context.cookies()
  70  |     const fsCookie = cookies.find((c) => c.name === 'fs_ref')
  71  |     expect(fsCookie?.value).toBe(VALID_AFFILIATE_CODE.toUpperCase())
  72  |   })
  73  | 
  74  |   // AF-02: Codigo invalido — redirect para /cadastro sem query param
  75  |   test('AF-02: /ref/[codigo] invalido redireciona para /cadastro sem pre-preenchimento', async ({
  76  |     page,
  77  |     context,
  78  |   }) => {
  79  |     await page.goto('/ref/CODIGOINEXISTENTE999')
  80  |     await page.waitForURL('/cadastro', { timeout: 8_000 })
  81  | 
  82  |     const cookies = await context.cookies()
  83  |     const fsCookie = cookies.find((c) => c.name === 'fs_ref')
  84  |     // Nao deve setar cookie com codigo invalido
  85  |     expect(fsCookie?.value).not.toBe('CODIGOINEXISTENTE999')
  86  | 
  87  |     // URL nao deve ter query param ?ref=
  88  |     expect(page.url()).not.toContain('ref=')
  89  |   })
  90  | 
  91  |   // AF-03: Registro via afiliado — referredBy populado
  92  |   test('AF-03: Novo usuario registrado via link afiliado tem referredBy no banco', async ({
  93  |     request,
  94  |     page,
  95  |     context,
  96  |   }) => {
  97  |     // Simular visita ao link de afiliado primeiro (seta cookie)
  98  |     // expires: Unix timestamp em segundos (30 dias a partir de agora)
  99  |     const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
  100 |     await context.addCookies([
  101 |       {
  102 |         name: 'fs_ref',
  103 |         value: VALID_AFFILIATE_CODE.toUpperCase(),
  104 |         domain: new URL(page.url() || 'http://localhost:3000').hostname || 'localhost',
  105 |         path: '/',
  106 |         httpOnly: false,
  107 |         expires: expiresAt,
  108 |       },
  109 |     ])
  110 | 
  111 |     const email = uniqueEmail('affiliate-reg')
  112 |     createdEmails.push(email)
  113 | 
  114 |     // Registrar via API para inspecionar o resultado
  115 |     const res = await request.post('/api/v1/auth/register', {
  116 |       data: {
  117 |         name: 'Teste Afiliado',
  118 |         email,
  119 |         password: 'TestAfiliado123!',
  120 |         cpf: VALID_CPF_ADULT,
  121 |         birthDate: '1990-01-01',
  122 |         phone: '11999999999',
  123 |         favoriteClub: 'URU3',
  124 |         termsAccepted: true,
  125 |         referredByCode: VALID_AFFILIATE_CODE.toUpperCase(),
  126 |       },
  127 |     })
  128 | 
> 129 |     expect(res.status()).toBe(201)
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  130 |     const body = await res.json()
  131 |     expect(body.success).toBe(true)
  132 | 
  133 |     // O campo referredBy deve estar no perfil do usuario criado
  134 |     // (verificar via endpoint de admin ou via response)
  135 |     expect(body.data).toBeDefined()
  136 |   })
  137 | 
  138 |   // AF-04: AffiliateCard no perfil do usuario
  139 |   test('AF-04: AffiliateCard exibido no perfil com codigo e link de compartilhamento', async ({
  140 |     page,
  141 |   }) => {
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
```