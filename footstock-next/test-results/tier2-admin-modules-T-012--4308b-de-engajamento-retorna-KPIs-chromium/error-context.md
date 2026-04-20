# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier2-admin-modules.spec.ts >> T-012: Modulos do Admin — TIER 2 >> AM-05: Modulo de engajamento retorna KPIs
- Location: tests/e2e/tier2-admin-modules.spec.ts:136:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 429
```

# Test source

```ts
  40  |     await loginAs(page, 'admin')
  41  |     await page.goto('/admin/configuracoes')
  42  |     await page.waitForLoadState('networkidle')
  43  | 
  44  |     await expectNoServerError(page)
  45  | 
  46  |     const header = page.locator('[data-testid="admin-configuracoes-header"]')
  47  |     await expect(header).toBeVisible({ timeout: 10_000 })
  48  |   })
  49  | 
  50  |   test('AM-01d: SUPER_ADMIN acessa modulo de clubes', async ({ page }) => {
  51  |     await loginAs(page, 'admin')
  52  |     await page.goto('/admin/clubes')
  53  |     await page.waitForLoadState('networkidle')
  54  | 
  55  |     await expectNoServerError(page)
  56  | 
  57  |     const header = page.locator('[data-testid="admin-clubes-header"]')
  58  |     if (await header.isVisible({ timeout: 5_000 }).catch(() => false)) {
  59  |       await expect(header).toBeVisible()
  60  |     } else {
  61  |       // Verificar que a pagina nao tem erro 500
  62  |       await expect(page.locator('text=/500|Server Error/i')).not.toBeVisible()
  63  |     }
  64  |   })
  65  | 
  66  |   test('AM-01e: SUPER_ADMIN acessa modulo motor/matching', async ({ page }) => {
  67  |     await loginAs(page, 'admin')
  68  |     await page.goto('/admin/motor')
  69  |     await page.waitForLoadState('networkidle')
  70  | 
  71  |     await expectNoServerError(page)
  72  | 
  73  |     // Motor page deve ter KPIs
  74  |     const kpis = page.locator('main')
  75  |     await expect(kpis).toBeVisible({ timeout: 8_000 })
  76  |   })
  77  | 
  78  |   test('AM-02: MODERADOR nao pode acessar modulo financeiro (403 ou redirect)', async ({
  79  |     page,
  80  |   }) => {
  81  |     await loginAs(page, 'moderador')
  82  |     await page.goto('/admin/financeiro')
  83  |     await page.waitForLoadState('networkidle')
  84  | 
  85  |     // Deve redirecionar para pagina de acesso negado OU mostrar mensagem de erro
  86  |     // NUNCA tela em branco
  87  |     const body = page.locator('body')
  88  |     const bodyText = await body.textContent()
  89  |     expect(bodyText?.trim().length).toBeGreaterThan(0)
  90  | 
  91  |     // Nao deve ser 500
  92  |     await expect(page.locator('text=/500|Internal Server Error/i')).not.toBeVisible()
  93  | 
  94  |     // Deve haver indicativo de acesso negado ou redirect para /admin (modulo permitido)
  95  |     const isOnFinanceiro = page.url().includes('/admin/financeiro')
  96  |     if (isOnFinanceiro) {
  97  |       // Se ficou na pagina, deve mostrar mensagem de erro de permissao
  98  |       await expect(
  99  |         page.locator('text=/sem permiss.o|acesso negado|n.o autorizado|403/i')
  100 |       ).toBeVisible({ timeout: 5_000 })
  101 |     }
  102 |   })
  103 | 
  104 |   test('AM-03: API financeiro retorna 403 para MODERADOR', async ({ request }) => {
  105 |     const loginRes = await request.post('/api/v1/auth/login', {
  106 |       data: { email: USERS.moderador.email, password: USERS.moderador.password },
  107 |     })
  108 |     expect(loginRes.status()).toBe(200)
  109 | 
  110 |     // Modulo financeiro via API
  111 |     const res = await request.get('/api/v1/admin/financial', {
  112 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  113 |     })
  114 | 
  115 |     // Deve ser 403 para MODERADOR (sem acesso financeiro)
  116 |     expect([403, 404]).toContain(res.status())
  117 |     expect(res.status()).not.toBe(500)
  118 |   })
  119 | 
  120 |   test('AM-04: Pagina de configuracoes admin retorna estrutura de abas correta', async ({
  121 |     page,
  122 |   }) => {
  123 |     await loginAs(page, 'admin')
  124 |     await page.goto('/admin/configuracoes')
  125 |     await page.waitForLoadState('networkidle')
  126 | 
  127 |     await expectNoServerError(page)
  128 | 
  129 |     // Abas de configuracao
  130 |     const tabs = page.locator('[data-testid="admin-configuracoes-tabs"]')
  131 |     if (await tabs.isVisible({ timeout: 5_000 }).catch(() => false)) {
  132 |       await expect(tabs).toBeVisible()
  133 |     }
  134 |   })
  135 | 
  136 |   test('AM-05: Modulo de engajamento retorna KPIs', async ({ request }) => {
  137 |     const loginRes = await request.post('/api/v1/auth/login', {
  138 |       data: { email: USERS.admin.email, password: USERS.admin.password },
  139 |     })
> 140 |     expect(loginRes.status()).toBe(200)
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  141 | 
  142 |     const res = await request.get('/api/v1/admin/engagement', {
  143 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  144 |     })
  145 | 
  146 |     expect(res.status()).toBe(200)
  147 |     const body = await res.json()
  148 |     expect(body.success).toBe(true)
  149 |   })
  150 | 
  151 |   test('AM-06: Modulo de auditoria do admin disponivel', async ({ request }) => {
  152 |     const loginRes = await request.post('/api/v1/auth/login', {
  153 |       data: { email: USERS.admin.email, password: USERS.admin.password },
  154 |     })
  155 |     expect(loginRes.status()).toBe(200)
  156 | 
  157 |     const res = await request.get('/api/v1/admin/audit', {
  158 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  159 |     })
  160 | 
  161 |     expect([200, 204]).toContain(res.status())
  162 |     expect(res.status()).not.toBe(500)
  163 |   })
  164 | })
  165 | 
```