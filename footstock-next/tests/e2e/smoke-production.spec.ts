/**
 * Smoke Tests — Produção
 *
 * Executar contra a URL de produção para validar fluxos críticos com dados reais.
 *
 * Uso:
 *   TEST_ENV=production \
 *   TEST_CRAQUE_EMAIL=craque@footstock-test.com \
 *   TEST_CRAQUE_PASS=<senha-forte> \
 *   TEST_JOGADOR_EMAIL=jogador@footstock-test.com \
 *   TEST_JOGADOR_PASS=<senha-forte> \
 *   npx playwright test tests/e2e/smoke-production.spec.ts --reporter=html
 *
 * ATENÇÃO: Estes testes rodam contra produção real. Usar apenas contas de teste autorizadas.
 * Gerado por: module-30-finalizacao / TASK-3 ST001
 */

import { test, expect } from '@playwright/test'

// Credenciais via variáveis de ambiente — NUNCA hardcoded
const CRAQUE_EMAIL = process.env.TEST_CRAQUE_EMAIL ?? ''
const CRAQUE_PASS = process.env.TEST_CRAQUE_PASS ?? ''
const JOGADOR_EMAIL = process.env.TEST_JOGADOR_EMAIL ?? ''
const JOGADOR_PASS = process.env.TEST_JOGADOR_PASS ?? ''

test.describe('Smoke Tests — Produção', () => {
  test.beforeAll(() => {
    if (!CRAQUE_EMAIL || !CRAQUE_PASS) {
      throw new Error(
        'Smoke tests requerem TEST_CRAQUE_EMAIL e TEST_CRAQUE_PASS configurados como variáveis de ambiente.'
      )
    }
  })

  test('ST001: Lista de mercado carrega com 40 ativos e preços reais', async ({ page }) => {
    await page.goto('/mercado')
    await expect(page.locator('[data-testid="asset-list"]')).toBeVisible({ timeout: 10_000 })
    const assetCards = page.locator('[data-testid="asset-card"]')
    await expect(assetCards).toHaveCount(40, { timeout: 15_000 })
    // Verificar que preços não são placeholder "--"
    const firstPrice = page.locator('[data-testid="asset-price"]').first()
    await expect(firstPrice).not.toHaveText('--', { timeout: 5_000 })
  })

  test('ST002: Login com usuário Craque', async ({ page }) => {
    await page.goto('/login')
    await page.locator('[data-testid="email-input"]').fill(CRAQUE_EMAIL)
    await page.locator('[data-testid="password-input"]').fill(CRAQUE_PASS)
    await page.locator('[data-testid="login-submit"]').click()
    await expect(page).toHaveURL(/\/mercado/, { timeout: 10_000 })
    await expect(page.locator('[data-testid="user-plan"]')).toContainText('Craque', { timeout: 5_000 })
  })

  test('ST003: Compra de ação — ordem enviada com sucesso', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.locator('[data-testid="email-input"]').fill(CRAQUE_EMAIL)
    await page.locator('[data-testid="password-input"]').fill(CRAQUE_PASS)
    await page.locator('[data-testid="login-submit"]').click()
    await expect(page).toHaveURL(/\/mercado/, { timeout: 10_000 })

    // Navegar para detalhe de ativo (Flamengo como referência)
    await page.goto('/ativo/fla')
    await page.locator('[data-testid="buy-button"]').click({ timeout: 10_000 })
    await page.locator('[data-testid="order-quantity"]').fill('1')
    await page.locator('[data-testid="confirm-order"]').click()
    await expect(
      page.locator('[data-testid="order-success-toast"], [data-testid="toast-success"]')
    ).toBeVisible({ timeout: 10_000 })
  })

  test('ST004: Assessor IA responde (plano Craque)', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.locator('[data-testid="email-input"]').fill(CRAQUE_EMAIL)
    await page.locator('[data-testid="password-input"]').fill(CRAQUE_PASS)
    await page.locator('[data-testid="login-submit"]').click()
    await expect(page).toHaveURL(/\/mercado/, { timeout: 10_000 })

    await page.goto('/assessor?ativo=fla')
    await page.locator('[data-testid="assessor-analyze"]').click({ timeout: 10_000 })
    // LLM pode demorar até 30s
    await expect(page.locator('[data-testid="assessor-result"]')).toBeVisible({ timeout: 30_000 })
    const resultText = await page.locator('[data-testid="assessor-result"]').textContent()
    expect(resultText).toBeTruthy()
    expect(resultText!.length).toBeGreaterThan(20)
    // Rejeitar resposta stub — garante que IA real está integrada
    expect(resultText).not.toContain('Análise em desenvolvimento')
  })

  test('ST005: Feed de notícias carregando com timestamp recente (< 24h)', async ({ page }) => {
    await page.goto('/noticias')
    await expect(page.locator('[data-testid="news-item"]').first()).toBeVisible({ timeout: 10_000 })
    // Verificar que a notícia mais recente tem timestamp das últimas 24h (não é fallback pool)
    const timestamp = await page.locator('[data-testid="news-timestamp"]').first().getAttribute('datetime')
    if (timestamp) {
      const newsDate = new Date(timestamp)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      expect(newsDate.getTime()).toBeGreaterThan(oneDayAgo.getTime())
    }
  })

  test('ST006: Motor de mercado emitindo ticks via WebSocket (< 5s)', async ({ page }) => {
    await page.goto('/mercado')
    let tickReceived = false
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        const payload = frame.payload?.toString() ?? ''
        if (payload.includes('market:tick') || payload.includes('tick')) {
          tickReceived = true
        }
      })
    })
    // Aguardar 5s — motor deve emitir tick a cada 2s
    await page.waitForTimeout(5_000)
    expect(tickReceived).toBe(true)
  })

  test('ST007: Rota de health check retorna todos os serviços OK', async ({ page }) => {
    const response = await page.request.get('/api/v1/health')
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      api: 'ok',
      db: 'ok',
      redis: 'ok',
      motor: 'ok',
    })
  })

  test('ST008: CORS rejeita origin não autorizada', async ({ page }) => {
    // Verificar que header CORS está presente e correto
    const response = await page.request.get('/api/v1/health', {
      headers: { Origin: 'https://evil-domain-test.com' },
    })
    const allowOriginHeader = response.headers()['access-control-allow-origin']
    // Deve retornar o domínio de produção, não o evil domain
    if (allowOriginHeader) {
      expect(allowOriginHeader).not.toBe('https://evil-domain-test.com')
      expect(allowOriginHeader).not.toBe('*')
    }
  })
})

test.describe('Smoke Tests Manuais — Checklist (não automatizados)', () => {
  test.skip('ST-MANUAL-001: Cadastro com CPF real — EXECUTAR MANUALMENTE', async () => {
    // Abrir https://{production-url}/cadastro
    // Preencher CPF válido de conta de teste autorizada
    // Verificar verificação de maioridade + email de confirmação
  })

  test.skip('ST-MANUAL-002: Login com biometria em dispositivo móvel real — EXECUTAR MANUALMENTE', async () => {
    // Abrir em dispositivo iOS/Android
    // Login com craque@footstock-test.com
    // Verificar Face ID / Touch ID solicitado
  })

  test.skip('ST-MANUAL-003: Assinatura Craque com Pix real — EXECUTAR MANUALMENTE', async () => {
    // Login como jogador@footstock-test.com
    // Navegar para /planos → Craque → Pix
    // Verificar QR Code R$19,90 + webhook dentro de 30s
  })

  test.skip('ST-MANUAL-004: Push notification em dispositivo real — EXECUTAR MANUALMENTE', async () => {
    // Login em dispositivo móvel (PWA)
    // Aceitar permissão de notificação
    // Executar compra → verificar push chegando no dispositivo
  })
})
