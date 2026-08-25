/**
 * TASK-21 — Fluxo Completo de Venda, Historicos e Relatorios
 * module-29-integration / FootStock
 *
 * Cenarios cobertos:
 *   TD-01: Modal SELL abre com inventario (posicao, reservas, disponivel)
 *   TD-02: Atalho "Max." preenche quantidade disponivel
 *   TD-03: Posicao totalmente reservada bloqueia venda
 *   TD-04: Venda executada aparece em /ordens com drill-down financeiro
 *   TD-05: Extrato no /portfolio exibe a transacao com drill-down
 *   TD-06: Filtro de periodo no extrato funciona
 *   TD-07: /relatorios carrega e CSV bloqueado para JOGADOR
 *   TD-08: /relatorios CSV disponivel para CRAQUE
 *   TD-09: Varredura de data-testids do modal SELL
 *   TD-10: Varredura de data-testids de ordens (detalhe)
 *   TD-11: Varredura de data-testids do extrato
 *   TD-12: Varredura de data-testids do relatorio
 *
 * PRE-REQUISITO:
 *   - Servidor em http://localhost:3000 (npm run dev ou npm run start)
 *   - Banco populado com seed data
 *   - npx playwright install --with-deps chromium
 */

import { test, expect, type Page } from '@playwright/test'
import { TEST_TICKER, resetDailyOrderCounter } from './setup'

async function resetSessionDailyOrderCounter(page: Page): Promise<void> {
  const sessionRes = await page.request.get('/api/v1/auth/session')
  const sessionBody = await sessionRes.json().catch(() => null)
  const userId = sessionBody?.user?.id as string | undefined
  if (userId) await resetDailyOrderCounter(userId)
}

// ─── Auth via storageState (gerado 1x por run em tests/e2e/global-setup.ts) ───

const CRAQUE_STATE = 'tests/e2e/.auth/craque.json'
const JOGADOR_STATE = 'tests/e2e/.auth/jogador.json'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitForNoSpinner(page: Page) {
  await page
    .waitForFunction(() => {
      const spinners = document.querySelectorAll(
        '[role="progressbar"], [aria-label*="loading" i], .loading, [data-loading="true"]',
      )
      return spinners.length === 0
    }, { timeout: 5000 })
    .catch(() => {})
}

/**
 * Dispensa o banner de consentimento de cookies quando presente
 * (dialog fixo no rodape que intercepta cliques no mobile).
 */
async function dismissCookieConsent(page: Page) {
  const accept = page.getByRole('button', { name: /^aceitar$/i })
  if (await accept.isVisible({ timeout: 1500 }).catch(() => false)) {
    await accept.click()
  }
}

/**
 * Abre o modal de venda a partir da pagina de detalhe do ativo.
 * Clica no botao de venda visivel no viewport (desktop ou mobile).
 */
async function openSellModal(page: Page, ticker: string) {
  await page.goto(`/mercado/${ticker}`)
  await page.waitForLoadState('networkidle')
  await waitForNoSpinner(page)
  await dismissCookieConsent(page)

  const sellBtn = page.locator('[data-testid="sell-btn-desktop"]:visible, [data-testid="sell-btn"]:visible').first()
  await sellBtn.waitFor({ state: 'visible', timeout: 8000 })
  await sellBtn.click()

  const dialog = page.locator('[role="dialog"]').first()
  await dialog.waitFor({ state: 'visible', timeout: 5000 })
}

function mockSellPreview(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 'e2e-asset-uru3',
    positionId: 'e2e-pos-uru3',
    ticker: TEST_TICKER,
    displayName: 'Urubu da Gavea FC',
    positionStatus: 'OPEN',
    hasPosition: true,
    ownedQty: 10,
    reservedQty: 0,
    availableQty: 10,
    avgPrice: 20,
    currentPrice: 23.54,
    currentPriceAsOf: '2026-08-25T16:20:16.000Z',
    isPriceDelayed: true,
    priceDelayMinutes: 30,
    ...overrides,
  }
}

async function openSellModalWithPreview(page: Page, preview: Record<string, unknown>) {
  await page.route('**/api/v1/positions/*/sell-preview', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: preview }),
    }),
  )
  await openSellModal(page, TEST_TICKER)
}

async function revealExtratoItem(page: Page, testId: string) {
  await page.locator('[data-testid="transaction-filter-financial-type"]').selectOption('TRADE')
  await expect(
    page.locator('[data-testid="transaction-history-success"], [data-testid="transaction-history-empty"]'),
  ).toBeVisible({ timeout: 8000 })

  const target = page.locator(`[data-testid="${testId}"]`)
  const next = page.locator('[data-testid="transaction-history-next"]')
  for (let i = 0; i < 25; i++) {
    if ((await target.count()) > 0) {
      await expect(target).toBeVisible()
      return
    }
    if (!(await next.isVisible().catch(() => false))) break
    if (await next.isDisabled()) break
    await next.click()
    await expect(
      page.locator('[data-testid="transaction-history-success"], [data-testid="transaction-history-empty"]'),
    ).toBeVisible({ timeout: 8000 })
  }
  await expect(target).toBeVisible()
}

// ─── TD-01: Modal SELL abre com inventario ────────────────────────────────────

test.describe('TD-01: Modal SELL — Inventario', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Modal SELL exibe bloco de inventario com posicao e precos', async ({ page }) => {
    await openSellModal(page, TEST_TICKER)

    const inventory = page.locator('[data-testid="order-sell-inventory"]')
    await expect(inventory).toBeVisible({ timeout: 8000 })

    // Campos do inventario (alguns podem mostrar "sem posicao" se o usuario nao tem cotas)
    const ownedQty = page.locator('[data-testid="order-sell-owned-qty"]')
    const reservedQty = page.locator('[data-testid="order-sell-reserved-qty"]')
    const availableQty = page.locator('[data-testid="order-sell-available-qty"]')
    const avgPrice = page.locator('[data-testid="order-sell-avg-price"]')
    const currentPrice = page.locator('[data-testid="order-sell-current-price"]')

    await expect(ownedQty).toBeVisible({ timeout: 5000 })
    await expect(reservedQty).toBeVisible()
    await expect(availableQty).toBeVisible()
    await expect(avgPrice).toBeVisible()
    await expect(currentPrice).toBeVisible()
  })

  test('Modal SELL exibe referencia de tempo da cotacao', async ({ page }) => {
    await openSellModal(page, TEST_TICKER)

    const priceAsOf = page.locator('[data-testid="order-sell-price-as-of"]')
    await expect(priceAsOf).toBeVisible({ timeout: 8000 })
  })
})

// ─── TD-02: Atalho "Max." preenche quantidade disponivel ─────────────────────

test.describe('TD-02: Modal SELL — Atalho Max.', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Botao Max. esta visivel e preenche o input de quantidade', async ({ page }) => {
    await openSellModal(page, TEST_TICKER)

    // Aguardar inventario carregar
    await expect(page.locator('[data-testid="order-sell-inventory"]')).toBeVisible({ timeout: 8000 })

    const maxBtn = page.locator('[data-testid="order-sell-max"]')
    await expect(maxBtn).toBeVisible()

    // Ler quantidade disponivel antes de clicar
    const availableText = await page.locator('[data-testid="order-sell-available-qty"]').textContent()
    const availableQty = availableText?.trim() ?? '0'

    await maxBtn.click()

    // Input de quantidade deve refletir o valor disponivel
    const inputValue = await page.locator('[data-testid="order-quantity-input"]').inputValue()
    expect(inputValue).toBe(availableQty)
  })
})

// ─── TD-03: Posicao totalmente reservada bloqueia venda ──────────────────────

test.describe('TD-03: Modal SELL — Bloqueio por reserva total', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Quando availableQty=0, modal exibe alerta de venda indisponivel', async ({ page }) => {
    await openSellModalWithPreview(page, mockSellPreview({
      ownedQty: 10,
      reservedQty: 10,
      availableQty: 0,
    }))

    await expect(page.locator('[data-testid="order-sell-inventory"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-testid="order-sell-unavailable"]')).toBeVisible()
    await expect(page.locator('[data-testid="order-submit"]')).toBeDisabled()
  })

  test('Sem posicao, mensagem de inventario vazio aparece', async ({ page }) => {
    await openSellModalWithPreview(page, mockSellPreview({
      positionId: null,
      positionStatus: null,
      hasPosition: false,
      ownedQty: 0,
      reservedQty: 0,
      availableQty: 0,
      avgPrice: null,
    }))

    await expect(page.locator('[data-testid="order-sell-inventory-empty"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-testid="order-submit"]')).toBeDisabled()
  })
})

// ─── TD-04: Venda em /ordens com drill-down financeiro ───────────────────────

test.describe('TD-04: /ordens — Historico e drill-down', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Pagina /ordens carrega e exibe container de historico', async ({ page }) => {
    await page.goto('/ordens')
    await page.waitForLoadState('networkidle')
    await waitForNoSpinner(page)

    // O container principal deve existir (pode estar vazio, loading ou com dados)
    const historyContainer = page.locator('[data-testid="order-history"]')
    await expect(historyContainer).toBeVisible({ timeout: 8000 })
  })

  test('Ordem executada exibe row com status e botao de expandir', async ({ page }) => {
    await page.goto('/ordens')
    await page.waitForLoadState('networkidle')

    // Aguardar carregamento concluir
    await expect(page.locator('[data-testid="order-history"]')).toBeVisible({ timeout: 8000 })

    // Fixture deterministica da run: venda executada e2e-order-sell-uru3-1
    // (SELL 10 URU3 @ 23,55 — inserida no banco de teste pelo preparo da Task 21)
    const row = page.locator('[data-testid="order-row-e2e-order-sell-uru3-1"]')
    await expect(row).toBeVisible({ timeout: 5000 })

    await expect(page.locator('[data-testid="order-status-e2e-order-sell-uru3-1"]')).toBeVisible()

    await page.locator('[data-testid="order-row-expand-e2e-order-sell-uru3-1"]').click()

    const details = page.locator('[data-testid="order-details-e2e-order-sell-uru3-1"]')
    await expect(details).toBeVisible({ timeout: 3000 })

    // Campos financeiros do drill-down (solicitado vs executado, bruto, taxa, liquido)
    await expect(page.locator('[data-testid="order-executed-price-e2e-order-sell-uru3-1"]')).toBeVisible()
    await expect(page.locator('[data-testid="order-executed-at-e2e-order-sell-uru3-1"]')).toBeVisible()
    await expect(page.locator('[data-testid="order-gross-e2e-order-sell-uru3-1"]')).toBeVisible()
    await expect(page.locator('[data-testid="order-fee-e2e-order-sell-uru3-1"]')).toBeVisible()
    await expect(page.locator('[data-testid="order-net-e2e-order-sell-uru3-1"]')).toBeVisible()
  })

  test('Venda real via UI e registrada e aparece em /ordens', async ({ page }) => {
    // SET 0 no Redis (nao DEL): senão `_getDailyCount` conta as ordens do dia no
    // banco e o submit fica desabilitado com "Limite diario atingido".
    await resetSessionDailyOrderCounter(page)

    await openSellModal(page, TEST_TICKER)

    // Inventario carregado (CRAQUE tem posicao URU3 da fixture)
    await expect(page.locator('[data-testid="order-sell-inventory"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-testid="order-sell-available-qty"]')).toBeVisible()

    await expect(page.locator('[data-testid="daily-limit-banner"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="order-submit"]')).toBeEnabled({ timeout: 5000 })

    // Submit real aguardando a resposta 201 do POST (evita depender do tempo de vida do toast)
    await page.locator('[data-testid="order-quantity-input"]').fill('1')
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/orders') && r.request().method() === 'POST',
        { timeout: 15000 },
      ),
      page.locator('[data-testid="order-submit"]').click(),
    ])
    expect(response.status()).toBe(201)
    const orderJson = await response.json()
    const orderId = orderJson?.data?.order?.id as string
    expect(orderId).toBeTruthy()

    // Feedback de sucesso com status (Zero Silencio) — toast visivel logo apos o 201
    const toast = page.locator('[data-sonner-toast]')
    await expect(toast).toContainText(/ordem de venda/i, { timeout: 8000 })

    // CTA "Ver ordem" quando ainda visivel; senao navega direto (toast expira rapido)
    const cta = page.getByRole('button', { name: /ver ordem/i })
    if (await cta.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cta.click()
      await page.waitForURL(/\/ordens/)
    } else {
      await page.goto('/ordens')
    }

    // A MESMA ordem criada aparece no historico, identificada pelo id do POST
    await expect(page.locator('[data-testid="order-history"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator(`[data-testid="order-row-${orderId}"]`)).toBeVisible({ timeout: 5000 })

    // Aguardar a liquidacao pelo motor (tick ~10s) via polling na API da propria sessao
    await expect
      .poll(
        async () => {
          const res = await page.request.get('/api/v1/orders')
          const body = await res.json()
          const ord = (body?.data ?? []).find((o: { id: string }) => o.id === orderId)
          return ord?.status
        },
        { timeout: 60_000, intervals: [3_000] },
      )
      .toBe('FILLED')

    // Extrato: a TRADE mais recente e a nossa venda liquidada — drill-down mostra o orderId
    await page.goto('/portfolio')
    await page.waitForLoadState('networkidle')
    await page.locator('#tab-extrato').click()
    await expect(page.locator('[data-testid="transaction-filters"]')).toBeVisible({ timeout: 8000 })
    const firstExpand = page.locator('[data-testid^="extrato-expand-"]').first()
    await expect(firstExpand).toBeVisible({ timeout: 5000 })
    await firstExpand.click()
    await expect(page.locator('[data-testid="extrato-order-id"]').first()).toContainText(orderId)

    // Relatorio: a MESMA venda aparece com os valores exatos da TRADE liquidada
    // (busca pela orderId prova correlacao; a assercao visual e na tabela)
    const txRes = await page.request.get('/api/v1/transactions?financialType=TRADE')
    const txBody = await txRes.json()
    const trade = (txBody?.data ?? []).find((t: { orderId?: string }) => t.orderId === orderId)
    expect(trade).toBeTruthy()
    const pnlText = Number(trade.realizedPnl).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

    await page.goto('/relatorios')
    await page.waitForLoadState('networkidle')
    const reportTable = page.locator('[data-testid="player-report-table"]')
    await expect(reportTable).toBeVisible({ timeout: 8000 })
    await expect(reportTable).toContainText('URU3')
    await expect(reportTable).toContainText(pnlText)
  })

  test('Filtros de status estao presentes', async ({ page }) => {
    await page.goto('/ordens')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-testid="order-history"]')).toBeVisible({ timeout: 8000 })

    // Filtros de status (botoes "Todas", "Aberta", "Executada", etc.)
    const allFilter = page.getByRole('button', { name: /todas/i })
    await expect(allFilter).toBeVisible()
  })
})

// ─── TD-05: Extrato no /portfolio com drill-down ─────────────────────────────

test.describe('TD-05: Extrato — Transacoes e drill-down', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Aba Extrato no /portfolio carrega filtro e lista', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('networkidle')
    await waitForNoSpinner(page)

    // Abrir a aba Extrato (os gatilhos de aba nao tem data-testid: selecao por nome acessivel)
    await page.locator('#tab-extrato').click()

    // Filtros do extrato devem aparecer
    const filters = page.locator('[data-testid="transaction-filters"]')
    await expect(filters).toBeVisible({ timeout: 8000 })
  })

  test('Venda executada exibe P/L realizado persistido no drill-down do extrato', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('networkidle')

    await page.locator('#tab-extrato').click()

    // Aguardar filtros carregarem
    await expect(page.locator('[data-testid="transaction-filters"]')).toBeVisible({ timeout: 8000 })

    // Fixture: TRADE e2e-tx-trade-sell-1 (SELL 10 URU3 @ 23,55; custo 200,00; P/L +35,50 PERSISTED)
    // O extrato pagina de 10 em 10; runs anteriores empurram a fixture para fora da 1a pagina.
    await revealExtratoItem(page, 'extrato-expand-e2e-tx-trade-sell-1')
    const expandBtn = page.locator('[data-testid="extrato-expand-e2e-tx-trade-sell-1"]')
    await expandBtn.click()

    const details = page.locator('[data-testid="extrato-details-e2e-tx-trade-sell-1"]')
    await expect(details).toBeVisible({ timeout: 3000 })

    // P/L realizado com valor numerico (proveniencia PERSISTED) e nota de taxas em separado
    const realized = page.locator('[data-testid="extrato-realized-pnl"]')
    await expect(realized).toBeVisible()
    await expect(realized).toContainText('35,50')
    await expect(details).toContainText(/taxas sao contabilizadas em separado/i)

    // Identificadores e saldos do drill-down (cobertura incondicional dos testids da secao 13)
    await expect(page.locator('[data-testid="extrato-transaction-id"]')).toContainText('e2e-tx-trade-sell-1')
    await expect(page.locator('[data-testid="extrato-order-id"]')).toContainText('e2e-order-sell-uru3-1')
    await expect(page.locator('[data-testid="extrato-balance-before"]')).toBeVisible()
    await expect(page.locator('[data-testid="extrato-balance-after"]')).toBeVisible()
  })
})

// ─── TD-06: Filtro de periodo no extrato ─────────────────────────────────────

test.describe('TD-06: Extrato — Filtro de periodo', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Filtros de data De/Ate estao presentes e aceitam input', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('networkidle')

    await page.locator('#tab-extrato').click()

    await expect(page.locator('[data-testid="transaction-filters"]')).toBeVisible({ timeout: 8000 })

    const fromFilter = page.locator('[data-testid="transaction-filter-from"]')
    const toFilter = page.locator('[data-testid="transaction-filter-to"]')

    await expect(fromFilter).toBeVisible()
    await expect(toFilter).toBeVisible()

    // Preencher periodo
    await fromFilter.fill('2026-01-01')
    await toFilter.fill('2026-12-31')

    // Filtro de tipo de operacao
    const typeFilter = page.locator('[data-testid="transaction-filter-type"]')
    await expect(typeFilter).toBeVisible()
  })

  test('Botao limpar filtros esta presente', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('networkidle')

    await page.locator('#tab-extrato').click()

    await expect(page.locator('[data-testid="transaction-filters"]')).toBeVisible({ timeout: 8000 })

    const clearBtn = page.locator('[data-testid="transaction-filter-clear"]')
    await expect(clearBtn).toBeVisible()
  })
})

// ─── TD-07: /relatorios — CSV bloqueado para JOGADOR ─────────────────────────

test.describe('TD-07: /relatorios — Gate CSV para JOGADOR', () => {
  test.use({ storageState: JOGADOR_STATE })

  test('Pagina /relatorios carrega sem erro', async ({ page }) => {
    await page.goto('/relatorios')
    await page.waitForLoadState('networkidle')
    await waitForNoSpinner(page)

    const reportPage = page.locator('[data-testid="player-report-page"]')
    await expect(reportPage).toBeVisible({ timeout: 8000 })
  })

  test('JOGADOR ve botao de exportacao bloqueado', async ({ page }) => {
    await page.goto('/relatorios')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('[data-testid="player-report-page"]')).toBeVisible({ timeout: 8000 })

    // Botao de exportacao deve estar bloqueado (locked) para JOGADOR
    const lockedBtn = page.locator('[data-testid="player-report-export-locked"]')
    await expect(lockedBtn).toBeVisible({ timeout: 5000 })

    // O botao ativo de exportacao NAO deve existir
    const activeExportBtn = page.locator('[data-testid="player-report-export"]')
    await expect(activeExportBtn).not.toBeVisible()
  })
})

// ─── TD-08: /relatorios — CSV disponivel para CRAQUE ─────────────────────────

test.describe('TD-08: /relatorios — Gate CSV para CRAQUE', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('CRAQUE ve botao de exportacao disponivel', async ({ page }) => {
    await page.goto('/relatorios')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('[data-testid="player-report-page"]')).toBeVisible({ timeout: 8000 })

    // Botao de exportacao deve estar disponivel para CRAQUE
    const exportBtn = page.locator('[data-testid="player-report-export"]')
    await expect(exportBtn).toBeVisible({ timeout: 5000 })

    // O botao bloqueado NAO deve existir
    const lockedBtn = page.locator('[data-testid="player-report-export-locked"]')
    await expect(lockedBtn).not.toBeVisible()
  })

  test('Tabela de relatorio e filtros estao presentes', async ({ page }) => {
    await page.goto('/relatorios')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('[data-testid="player-report-page"]')).toBeVisible({ timeout: 8000 })

    // Filtros (reutiliza TransactionFilters)
    const filters = page.locator('[data-testid="transaction-filters"]')
    await expect(filters).toBeVisible({ timeout: 5000 })
  })
})

// ─── TD-09: Varredura de data-testids — Modal SELL ───────────────────────────

test.describe('TD-09: Varredura testids — Modal SELL', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Todos os testids do modal SELL estao no DOM quando aplicavel', async ({ page }) => {
    await openSellModal(page, TEST_TICKER)

    // Inventario container
    await expect(page.locator('[data-testid="order-sell-inventory"]')).toBeVisible({ timeout: 8000 })

    // Form
    await expect(page.locator('[data-testid="order-form"]')).toBeVisible()

    // Submit
    await expect(page.locator('[data-testid="order-submit"]')).toBeVisible()

    // Quantity input
    await expect(page.locator('[data-testid="order-quantity-input"]')).toBeVisible()

    // Max button e P/L estimado: incondicionais (CRAQUE tem posicao URU3 da fixture e preco)
    await expect(page.locator('[data-testid="order-sell-max"]')).toBeVisible()
    await expect(page.locator('[data-testid="order-sell-estimated-pnl"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="order-sell-pnl-gross"]')).toBeVisible()
    await expect(page.locator('[data-testid="order-sell-pnl-fee"]')).toBeVisible()
    await expect(page.locator('[data-testid="order-sell-pnl-net"]')).toBeVisible()
  })
})

// ─── TD-09b: Estados do preview SELL (route mock deterministico) ────────────

test.describe('TD-09b: Modal SELL — estados loading/error/retry do preview', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Preview lento exibe o estado loading do inventario', async ({ page }) => {
    // Atraso deterministico no preview para capturar o skeleton
    await page.route('**/api/v1/positions/*/sell-preview', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.continue()
    })

    await page.goto(`/mercado/${TEST_TICKER}`)
    await page.waitForLoadState('networkidle')
    await dismissCookieConsent(page)
    await page.locator('[data-testid="sell-btn-desktop"]:visible, [data-testid="sell-btn"]:visible').first().click()
    await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 5000 })

    await expect(page.locator('[data-testid="order-sell-inventory-loading"]')).toBeVisible({ timeout: 3000 })

    // Apos o delay, o inventario carrega normalmente
    await expect(page.locator('[data-testid="order-sell-inventory"]')).toBeVisible({ timeout: 10000 })
  })

  test('Falha do preview exibe error com retry, e o retry recupera', async ({ page }) => {
    // 503 PRICE_BUFFERING: estado de erro com retry oferecido (UX-006)
    await page.route('**/api/v1/positions/*/sell-preview', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'PRICE_BUFFERING', message: 'Preco em bufferizacao' } }),
      }),
    )

    await openSellModal(page, TEST_TICKER)

    await expect(page.locator('[data-testid="order-sell-inventory-error"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-testid="order-sell-inventory-retry"]')).toBeVisible()

    // Remover o mock e usar o retry: o inventario deve carregar
    await page.unroute('**/api/v1/positions/*/sell-preview')
    await page.locator('[data-testid="order-sell-inventory-retry"]').click()
    await expect(page.locator('[data-testid="order-sell-inventory"]')).toBeVisible({ timeout: 10000 })
  })
})

// ─── TD-10: Varredura testids — Ordens (drill-down) ─────────────────────────

test.describe('TD-10: Varredura testids — Ordens', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Testids de order-history estao no DOM', async ({ page }) => {
    await page.goto('/ordens')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('[data-testid="order-history"]')).toBeVisible({ timeout: 8000 })

    // Fixture garante ordens: testids dinamicos incondicionais
    const firstRow = page.locator('[data-testid^="order-row-"]').first()
    await expect(firstRow).toBeVisible({ timeout: 5000 })

    // Status, expand, e detalhes apos expansao
    await expect(page.locator('[data-testid^="order-status-"]').first()).toBeVisible()
    await expect(page.locator('[data-testid^="order-row-expand-"]').first()).toBeVisible()

    await page.locator('[data-testid^="order-row-expand-"]').first().click()

    await expect(page.locator('[data-testid^="order-details-"]').first()).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[data-testid^="order-gross-"]').first()).toBeVisible()
    await expect(page.locator('[data-testid^="order-fee-"]').first()).toBeVisible()
    await expect(page.locator('[data-testid^="order-net-"]').first()).toBeVisible()
  })
})

// ─── TD-11: Varredura testids — Extrato ──────────────────────────────────────

test.describe('TD-11: Varredura testids — Extrato', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Testids de transaction-filters e extrato estao no DOM', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('networkidle')

    await page.locator('#tab-extrato').click()

    // Filtros
    await expect(page.locator('[data-testid="transaction-filters"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-testid="transaction-filter-type"]')).toBeVisible()
    await expect(page.locator('[data-testid="transaction-filter-financial-type"]')).toBeVisible()
    await expect(page.locator('[data-testid="transaction-filter-asset"]')).toBeVisible()
    await expect(page.locator('[data-testid="transaction-filter-from"]')).toBeVisible()
    await expect(page.locator('[data-testid="transaction-filter-to"]')).toBeVisible()
    await expect(page.locator('[data-testid="transaction-filter-clear"]')).toBeVisible()

    // Fixture garante transacoes: testids de item incondicionais
    const firstItem = page.locator('[data-testid^="extrato-trade-item"], [data-testid^="extrato-fee-item"], [data-testid^="extrato-bonus-item"]').first()
    await expect(firstItem).toBeVisible({ timeout: 5000 })

    await expect(page.locator('[data-testid="extrato-asset-ticker"]').first()).toBeVisible()
    await expect(page.locator('[data-testid="extrato-cash-delta"]').first()).toBeVisible()
    await expect(page.locator('[data-testid="extrato-executed-at"]').first()).toBeVisible()
  })
})

// ─── TD-12: Varredura testids — Relatorio ────────────────────────────────────

test.describe('TD-12: Varredura testids — Relatorio', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Testids de player-report estao no DOM', async ({ page }) => {
    await page.goto('/relatorios')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('[data-testid="player-report-page"]')).toBeVisible({ timeout: 8000 })

    // Export button (CRAQUE tem acesso)
    await expect(page.locator('[data-testid="player-report-export"]')).toBeVisible({ timeout: 5000 })

    // Filtros do relatorio (reutiliza TransactionFilters)
    await expect(page.locator('[data-testid="transaction-filters"]')).toBeVisible()

    // Tabela presente de forma incondicional (fixture garante TRADEs)
    await expect(page.locator('[data-testid="player-report-table"]')).toBeVisible({ timeout: 5000 })
  })

  test('Venda executada da fixture aparece na tabela do relatorio', async ({ page }) => {
    await page.goto('/relatorios')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('[data-testid="player-report-page"]')).toBeVisible({ timeout: 8000 })

    // A TRADE e2e-tx-trade-sell-1 (SELL 10 URU3) e a mais recente: linha com URU3 e P/L
    const table = page.locator('[data-testid="player-report-table"]')
    await expect(table).toBeVisible({ timeout: 5000 })
    await expect(table).toContainText('URU3')
    await expect(table).toContainText('35,50')
  })

  test('Filtro sem resultado exibe player-report-empty', async ({ page }) => {
    await page.route('**/api/v1/transactions*', (route) => {
      const url = route.request().url()
      if (route.request().method() !== 'GET' || url.includes('/export')) {
        return route.continue()
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          pagination: { page: 1, total: 0, totalPages: 0, hasNext: false },
        }),
      })
    })

    await page.goto('/relatorios')
    await expect(page.locator('[data-testid="player-report-empty"]')).toBeVisible({ timeout: 8000 })
  })
})

// ─── TD-12b: Estados do plan-guard na exportacao (route mock deterministico) ─

test.describe('TD-12b: /relatorios — estados loading/error do plan-guard', () => {
  test.use({ storageState: CRAQUE_STATE })

  test('Plano carregando exibe player-report-export-loading', async ({ page }) => {
    // Atraso deterministico no /users/me (fonte do usePlanGuard)
    await page.route('**/api/v1/users/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.continue()
    })

    await page.goto('/relatorios')

    await expect(page.locator('[data-testid="player-report-export-loading"]')).toBeVisible({ timeout: 5000 })
    // Recupera quando o fetch conclui
    await expect(page.locator('[data-testid="player-report-export"]')).toBeVisible({ timeout: 10000 })
  })

  test('Falha do plan-guard exibe player-report-export-error', async ({ page }) => {
    await page.route('**/api/v1/users/me', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SYS-001', message: 'falha simulada de teste' } }),
      }),
    )

    await page.goto('/relatorios')

    await expect(page.locator('[data-testid="player-report-export-error"]')).toBeVisible({ timeout: 8000 })
  })
})
