# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke-production.spec.ts >> Smoke Tests — Produção >> ST001: Lista de mercado carrega com 40 ativos e preços reais
- Location: tests/e2e/smoke-production.spec.ts:35:7

# Error details

```
Error: Smoke tests requerem TEST_CRAQUE_EMAIL e TEST_CRAQUE_PASS configurados como variáveis de ambiente.
```

# Test source

```ts
  1   | /**
  2   |  * Smoke Tests — Produção
  3   |  *
  4   |  * Executar contra a URL de produção para validar fluxos críticos com dados reais.
  5   |  *
  6   |  * Uso:
  7   |  *   TEST_ENV=production \
  8   |  *   TEST_CRAQUE_EMAIL=craque@footstock-test.com \
  9   |  *   TEST_CRAQUE_PASS=<senha-forte> \
  10  |  *   TEST_JOGADOR_EMAIL=jogador@footstock-test.com \
  11  |  *   TEST_JOGADOR_PASS=<senha-forte> \
  12  |  *   npx playwright test tests/e2e/smoke-production.spec.ts --reporter=html
  13  |  *
  14  |  * ATENÇÃO: Estes testes rodam contra produção real. Usar apenas contas de teste autorizadas.
  15  |  * Gerado por: module-30-finalizacao / TASK-3 ST001
  16  |  */
  17  | 
  18  | import { test, expect } from '@playwright/test'
  19  | 
  20  | // Credenciais via variáveis de ambiente — NUNCA hardcoded
  21  | const CRAQUE_EMAIL = process.env.TEST_CRAQUE_EMAIL ?? ''
  22  | const CRAQUE_PASS = process.env.TEST_CRAQUE_PASS ?? ''
  23  | const JOGADOR_EMAIL = process.env.TEST_JOGADOR_EMAIL ?? ''
  24  | const JOGADOR_PASS = process.env.TEST_JOGADOR_PASS ?? ''
  25  | 
  26  | test.describe('Smoke Tests — Produção', () => {
  27  |   test.beforeAll(() => {
  28  |     if (!CRAQUE_EMAIL || !CRAQUE_PASS) {
> 29  |       throw new Error(
      |             ^ Error: Smoke tests requerem TEST_CRAQUE_EMAIL e TEST_CRAQUE_PASS configurados como variáveis de ambiente.
  30  |         'Smoke tests requerem TEST_CRAQUE_EMAIL e TEST_CRAQUE_PASS configurados como variáveis de ambiente.'
  31  |       )
  32  |     }
  33  |   })
  34  | 
  35  |   test('ST001: Lista de mercado carrega com 40 ativos e preços reais', async ({ page }) => {
  36  |     await page.goto('/mercado')
  37  |     await expect(page.locator('[data-testid="asset-list"]')).toBeVisible({ timeout: 10_000 })
  38  |     const assetCards = page.locator('[data-testid="asset-card"]')
  39  |     await expect(assetCards).toHaveCount(40, { timeout: 15_000 })
  40  |     // Verificar que preços não são placeholder "--"
  41  |     const firstPrice = page.locator('[data-testid="asset-price"]').first()
  42  |     await expect(firstPrice).not.toHaveText('--', { timeout: 5_000 })
  43  |   })
  44  | 
  45  |   test('ST002: Login com usuário Craque', async ({ page }) => {
  46  |     await page.goto('/login')
  47  |     await page.locator('[data-testid="email-input"]').fill(CRAQUE_EMAIL)
  48  |     await page.locator('[data-testid="password-input"]').fill(CRAQUE_PASS)
  49  |     await page.locator('[data-testid="login-submit"]').click()
  50  |     await expect(page).toHaveURL(/\/mercado/, { timeout: 10_000 })
  51  |     await expect(page.locator('[data-testid="user-plan"]')).toContainText('Craque', { timeout: 5_000 })
  52  |   })
  53  | 
  54  |   test('ST003: Compra de ação — ordem enviada com sucesso', async ({ page }) => {
  55  |     // Login
  56  |     await page.goto('/login')
  57  |     await page.locator('[data-testid="email-input"]').fill(CRAQUE_EMAIL)
  58  |     await page.locator('[data-testid="password-input"]').fill(CRAQUE_PASS)
  59  |     await page.locator('[data-testid="login-submit"]').click()
  60  |     await expect(page).toHaveURL(/\/mercado/, { timeout: 10_000 })
  61  | 
  62  |     // Navegar para detalhe de ativo (Flamengo como referência)
  63  |     await page.goto('/ativo/fla')
  64  |     await page.locator('[data-testid="buy-button"]').click({ timeout: 10_000 })
  65  |     await page.locator('[data-testid="order-quantity"]').fill('1')
  66  |     await page.locator('[data-testid="confirm-order"]').click()
  67  |     await expect(
  68  |       page.locator('[data-testid="order-success-toast"], [data-testid="toast-success"]')
  69  |     ).toBeVisible({ timeout: 10_000 })
  70  |   })
  71  | 
  72  |   test('ST004: Assessor IA responde (plano Craque)', async ({ page }) => {
  73  |     // Login
  74  |     await page.goto('/login')
  75  |     await page.locator('[data-testid="email-input"]').fill(CRAQUE_EMAIL)
  76  |     await page.locator('[data-testid="password-input"]').fill(CRAQUE_PASS)
  77  |     await page.locator('[data-testid="login-submit"]').click()
  78  |     await expect(page).toHaveURL(/\/mercado/, { timeout: 10_000 })
  79  | 
  80  |     await page.goto('/assessor?ativo=fla')
  81  |     await page.locator('[data-testid="assessor-analyze"]').click({ timeout: 10_000 })
  82  |     // LLM pode demorar até 30s
  83  |     await expect(page.locator('[data-testid="assessor-result"]')).toBeVisible({ timeout: 30_000 })
  84  |     const resultText = await page.locator('[data-testid="assessor-result"]').textContent()
  85  |     expect(resultText).toBeTruthy()
  86  |     expect(resultText!.length).toBeGreaterThan(20)
  87  |     // Rejeitar resposta stub — garante que IA real está integrada
  88  |     expect(resultText).not.toContain('Análise em desenvolvimento')
  89  |   })
  90  | 
  91  |   test('ST005: Feed de notícias carregando com timestamp recente (< 24h)', async ({ page }) => {
  92  |     await page.goto('/noticias')
  93  |     await expect(page.locator('[data-testid="news-item"]').first()).toBeVisible({ timeout: 10_000 })
  94  |     // Verificar que a notícia mais recente tem timestamp das últimas 24h (não é fallback pool)
  95  |     const timestamp = await page.locator('[data-testid="news-timestamp"]').first().getAttribute('datetime')
  96  |     if (timestamp) {
  97  |       const newsDate = new Date(timestamp)
  98  |       const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  99  |       expect(newsDate.getTime()).toBeGreaterThan(oneDayAgo.getTime())
  100 |     }
  101 |   })
  102 | 
  103 |   test('ST006: Motor de mercado emitindo ticks via WebSocket (< 5s)', async ({ page }) => {
  104 |     await page.goto('/mercado')
  105 |     let tickReceived = false
  106 |     page.on('websocket', (ws) => {
  107 |       ws.on('framereceived', (frame) => {
  108 |         const payload = frame.payload?.toString() ?? ''
  109 |         if (payload.includes('market:tick') || payload.includes('tick')) {
  110 |           tickReceived = true
  111 |         }
  112 |       })
  113 |     })
  114 |     // Aguardar 5s — motor deve emitir tick a cada 2s
  115 |     await page.waitForTimeout(5_000)
  116 |     expect(tickReceived).toBe(true)
  117 |   })
  118 | 
  119 |   test('ST007: Rota de health check retorna todos os serviços OK', async ({ page }) => {
  120 |     const response = await page.request.get('/api/v1/health')
  121 |     expect(response.status()).toBe(200)
  122 |     const body = await response.json()
  123 |     expect(body).toMatchObject({
  124 |       api: 'ok',
  125 |       db: 'ok',
  126 |       redis: 'ok',
  127 |       motor: 'ok',
  128 |     })
  129 |   })
```