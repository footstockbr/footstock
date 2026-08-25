/**
 * @jest-environment jsdom
 *
 * Task 06 — o modal de venda precisa mostrar inventario, bloqueios e P/L estimado
 * ANTES do clique, em vez de deixar o backend recusar a ordem depois (ORDER_050).
 * Este teste trava os quatro estados do preview, a fonte unica de preco do lado
 * SELL (nunca o tick), a decomposicao do P/L e a recuperabilidade por codigo de
 * erro. Sem `@testing-library/jest-dom` no projeto: as assercoes usam
 * `textContent` + `toContain`.
 */
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { OrderForm } from '@/components/orders/OrderForm'
import { Modal } from '@/components/ui/modal'
import { calculateFee } from '@/lib/constants/limits'
import type { SellPreviewDto } from '@/lib/contracts/sell-preview-contract'

let mockPlan = 'CRAQUE'
let mockTickPrice = 999.99
const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}))
jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))
jest.mock('@/hooks/usePlanGuard', () => ({
  usePlanGuard: () => ({
    plan: mockPlan,
    isLoading: false,
    isError: false,
    isReady: true,
    hasAccess: () => mockPlan === 'LENDA',
  }),
}))
jest.mock('@/contexts/motor-status-context', () => ({
  useMotorStatusContext: () => ({ isOffline: false }),
}))
jest.mock('@/hooks/useMarketSession', () => ({
  useMarketSession: () => ({ session: 'TRADING' }),
}))
jest.mock('@/hooks/useMarketTick', () => ({
  useMarketTick: () => ({
    tick: { lastPrice: mockTickPrice },
    connectionState: 'open',
    isBuffering: false,
    isOffline: false,
    error: null,
  }),
}))
jest.mock('@/hooks/useBalance', () => ({ useBalance: () => ({ fsBalance: 10_000 }) }))
jest.mock('@/hooks/useAnalytics', () => ({ useAnalytics: () => ({ track: jest.fn() }) }))
jest.mock('@/components/orders/PriceHistoryChart', () => ({ PriceHistoryChart: () => null }))
jest.mock('@/components/payments/PlanCTAButton', () => ({
  PlanCTAButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))

// ── Infra de rede ────────────────────────────────────────────────────────────
type FakeResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
  headers: { get: (name: string) => string | null }
}

function fakeResponse(body: unknown, status = 200): FakeResponse {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    headers: { get: () => null },
  }
}

const mockFetch = jest.fn()
let previewQueue: Array<FakeResponse | Promise<FakeResponse>> = []
let orderQueue: Array<FakeResponse> = []

/** Consome a proxima resposta da fila e repete a ultima quando ela acaba. */
function nextFrom<T>(queue: T[]): T {
  return queue.length > 1 ? (queue.shift() as T) : (queue[0] as T)
}

function previewDto(over: Partial<SellPreviewDto> = {}): SellPreviewDto {
  return {
    assetId: 'asset-1',
    positionId: 'pos-1',
    ticker: 'URU3',
    displayName: 'Uruguaiana FC',
    positionStatus: 'OPEN',
    hasPosition: true,
    ownedQty: 10,
    reservedQty: 0,
    availableQty: 10,
    avgPrice: 10,
    currentPrice: 12.5,
    currentPriceAsOf: '2026-08-24T14:30:00.000Z',
    isPriceDelayed: false,
    priceDelayMinutes: 0,
    ...over,
  }
}

function queuePreview(...responses: Array<FakeResponse | Promise<FakeResponse>>) {
  previewQueue = responses
}

function queuePreviewDto(...dtos: Array<Partial<SellPreviewDto>>) {
  previewQueue = dtos.map((d) => fakeResponse({ data: previewDto(d) }))
}

function queueOrder(...responses: FakeResponse[]) {
  orderQueue = responses
}

function postCalls() {
  return mockFetch.mock.calls.filter(
    ([url, init]) => String(url) === '/api/v1/orders' && (init as RequestInit | undefined)?.method === 'POST',
  )
}

function previewCalls() {
  return mockFetch.mock.calls.filter(([url]) => String(url).includes('sell-preview'))
}

beforeEach(() => {
  mockPlan = 'CRAQUE'
  mockTickPrice = 999.99
  mockToastSuccess.mockClear()
  mockToastError.mockClear()
  mockFetch.mockReset()
  queuePreviewDto({})
  queueOrder(fakeResponse({ data: { order: { id: 'ord-1', status: 'OPEN' } } }, 201))
  mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('daily-count')) return Promise.resolve(fakeResponse({ data: { remaining: 5 } }))
    if (url.includes('sell-preview')) return Promise.resolve(nextFrom(previewQueue))
    if (url === '/api/v1/orders' && init?.method === 'POST') return Promise.resolve(nextFrom(orderQueue))
    return Promise.resolve(fakeResponse({}, 404))
  })
  global.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
})

function renderSell() {
  return render(<OrderForm ticker="URU3" side="SELL" fsBalance={10_000} />)
}

async function renderSellReady() {
  const view = renderSell()
  await screen.findByTestId('order-sell-available-qty')
  return view
}

function submitButton() {
  return screen.getByTestId('order-submit') as HTMLButtonElement
}

function setQuantity(value: string) {
  fireEvent.change(screen.getByTestId('order-quantity-input'), { target: { value } })
}

// ── 1. Quatro estados ────────────────────────────────────────────────────────
describe('estados do preview de venda', () => {
  test('loading renderiza skeleton e mantem o submit desabilitado', async () => {
    let resolvePreview: (r: FakeResponse) => void = () => {}
    queuePreview(new Promise<FakeResponse>((resolve) => { resolvePreview = resolve }))

    renderSell()

    expect(screen.getByTestId('order-sell-inventory')).toBeTruthy()
    expect(screen.getByTestId('order-sell-inventory-loading')).toBeTruthy()
    expect(submitButton().disabled).toBe(true)

    resolvePreview(fakeResponse({ data: previewDto() }))
    await screen.findByTestId('order-sell-available-qty')
  })

  test('error oferece retry e o retry refaz a chamada', async () => {
    queuePreview(
      fakeResponse({ error: { code: 'SYS-001', message: 'falhou' } }, 500),
      fakeResponse({ data: previewDto() }),
    )

    renderSell()

    const erro = await screen.findByTestId('order-sell-inventory-error')
    expect(erro.textContent).toContain('Não foi possível carregar sua posição')
    expect(submitButton().disabled).toBe(true)

    fireEvent.click(screen.getByTestId('order-sell-inventory-retry'))

    await screen.findByTestId('order-sell-available-qty')
    expect(previewCalls().length).toBe(2)
    expect(submitButton().disabled).toBe(false)
  })

  test('empty explica a ausencia de posicao e bloqueia o submit', async () => {
    queuePreviewDto({
      positionId: null,
      positionStatus: null,
      hasPosition: false,
      ownedQty: 0,
      reservedQty: 0,
      availableQty: 0,
      avgPrice: null,
    })

    await renderSellReady()

    expect(screen.getByTestId('order-sell-inventory-empty').textContent).toContain('ainda não tem cotas')
    expect(screen.getByTestId('order-sell-avg-price').textContent).toContain('sem posição')
    expect(submitButton().disabled).toBe(true)
  })

  test('success preenche o inventario com os numeros do preview', async () => {
    queuePreviewDto({ ownedQty: 40, reservedQty: 15, availableQty: 25, avgPrice: 8.25 })

    await renderSellReady()

    expect(screen.getByTestId('order-sell-owned-qty').textContent).toContain('40')
    expect(screen.getByTestId('order-sell-reserved-qty').textContent).toContain('15')
    expect(screen.getByTestId('order-sell-available-qty').textContent).toContain('25')
    expect(screen.getByTestId('order-sell-avg-price').textContent).toContain('FS$ 8.25')
    expect(screen.getByTestId('order-sell-current-price').textContent).toContain('FS$ 12.50')
    expect(submitButton().disabled).toBe(false)
  })
})

// ── 2. Bloqueios ─────────────────────────────────────────────────────────────
describe('bloqueios de venda', () => {
  test('posicao totalmente reservada bloqueia o submit e explica a razao com link para /ordens', async () => {
    queuePreviewDto({ ownedQty: 30, reservedQty: 30, availableQty: 0, avgPrice: 9 })

    const { container } = await renderSellReady()

    const aviso = screen.getByTestId('order-sell-unavailable')
    expect(aviso.textContent).toContain('reservadas em ordens de venda abertas')
    expect(container.querySelector('[data-testid="order-sell-unavailable"] a')?.getAttribute('href')).toBe('/ordens')
    expect(submitButton().disabled).toBe(true)
  })

  test('quantidade acima do disponivel bloqueia o submit antes do POST', async () => {
    queuePreviewDto({ ownedQty: 10, reservedQty: 0, availableQty: 10 })

    const { container } = await renderSellReady()
    setQuantity('11')

    expect(screen.getByTestId('order-sell-exceeds').textContent).toContain('10 cota(s) disponível(is)')
    expect(submitButton().disabled).toBe(true)

    // Submit programatico: mesmo contornando o botao desabilitado, o validador
    // barra antes de qualquer POST.
    fireEvent.submit(screen.getByTestId('order-form'))
    await waitFor(() => expect(container.querySelector('#order-quantity-error')).toBeTruthy())
    expect(container.querySelector('#order-quantity-error')?.textContent).toContain('10 cota(s) disponível(is)')
    expect(postCalls().length).toBe(0)
  })

  test('atalho Max. preenche exatamente availableQty', async () => {
    queuePreviewDto({ ownedQty: 40, reservedQty: 13, availableQty: 27 })

    await renderSellReady()
    fireEvent.click(screen.getByTestId('order-sell-max'))

    expect((screen.getByTestId('order-quantity-input') as HTMLInputElement).value).toBe('27')
    expect(submitButton().disabled).toBe(false)
  })
})

// ── 3. Cobertura dos treze data-testid da secao 13 do fonte ──────────────────
test('os treze data-testid existem nos estados correspondentes', async () => {
  const encontrados = new Set<string>()
  const registrar = (ids: string[]) => ids.forEach((id) => {
    expect(screen.getByTestId(id)).toBeTruthy()
    encontrados.add(id)
  })

  // loading
  let resolvePreview: (r: FakeResponse) => void = () => {}
  queuePreview(new Promise<FakeResponse>((resolve) => { resolvePreview = resolve }))
  renderSell()
  registrar(['order-sell-inventory', 'order-sell-inventory-loading'])
  resolvePreview(fakeResponse({ data: previewDto() }))
  await screen.findByTestId('order-sell-available-qty')
  cleanup()

  // error com retry
  queuePreview(fakeResponse({ error: { code: 'PRICE_BUFFERING', message: 'buffer' } }, 503))
  renderSell()
  await screen.findByTestId('order-sell-inventory-error')
  registrar(['order-sell-inventory-error', 'order-sell-inventory-retry'])
  cleanup()

  // empty (sem posicao => tambem indisponivel)
  queuePreviewDto({ hasPosition: false, ownedQty: 0, reservedQty: 0, availableQty: 0, avgPrice: null, positionId: null, positionStatus: null })
  renderSell()
  await screen.findByTestId('order-sell-available-qty')
  registrar(['order-sell-inventory-empty', 'order-sell-unavailable'])
  cleanup()

  // success com posicao vendavel
  queuePreviewDto({})
  renderSell()
  await screen.findByTestId('order-sell-available-qty')
  registrar([
    'order-sell-owned-qty',
    'order-sell-reserved-qty',
    'order-sell-available-qty',
    'order-sell-avg-price',
    'order-sell-current-price',
    'order-sell-max',
    'order-sell-estimated-pnl',
  ])

  expect(encontrados.size).toBe(13)
})

// ── 4. P/L estimado ──────────────────────────────────────────────────────────
describe('P/L estimado', () => {
  test('vale (precoReferencia - avgPrice) * quantidade - taxaEstimada e aparece decomposto', async () => {
    // Valores fixos: avg 10,00 / corrente 12,50 / 4 cotas.
    // valor da operacao = 4 x 12,50 = 50,00 -> faixa <= 500 -> taxa 0,25
    // bruto = (12,50 - 10,00) x 4 = 10,00 | apos a taxa = 10,00 - 0,25 = 9,75
    queuePreviewDto({ avgPrice: 10, currentPrice: 12.5, ownedQty: 10, availableQty: 10 })

    await renderSellReady()
    setQuantity('4')

    expect(calculateFee(50)).toBe(0.25)
    const bloco = screen.getByTestId('order-sell-estimated-pnl')
    expect(bloco.textContent).toContain('P/L estimado')
    expect(screen.getByTestId('order-sell-pnl-gross').textContent).toBe('+FS$ 10.00')
    expect(screen.getByTestId('order-sell-pnl-fee').textContent).toContain('FS$ 0.25')
    expect(screen.getByTestId('order-sell-pnl-net').textContent).toBe('+FS$ 9.75')
  })

  test('explicita que e estimativa por preco medio e reconcilia com o realizado bruto do extrato', async () => {
    queuePreviewDto({ avgPrice: 10, currentPrice: 12.5 })

    const { container } = await renderSellReady()
    setQuantity('4')

    const texto = screen.getByTestId('order-sell-estimated-pnl').textContent ?? ''
    expect(texto).toContain('estimado')
    expect(texto).toContain('preço médio')
    expect(texto).toContain('bruto de taxas')
    // O rotulo de estimativa nunca aparece sozinho como numero solto.
    expect(container.querySelector('[data-testid="order-sell-pnl-gross"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="order-sell-pnl-net"]')).toBeTruthy()
  })

  test('prejuizo estimado aparece com sinal negativo', async () => {
    queuePreviewDto({ avgPrice: 20, currentPrice: 12.5 })

    await renderSellReady()
    setQuantity('4')

    // bruto = (12,50 - 20,00) x 4 = -30,00 | apos a taxa = -30,25
    expect(screen.getByTestId('order-sell-pnl-gross').textContent).toBe('-FS$ 30.00')
    expect(screen.getByTestId('order-sell-pnl-net').textContent).toBe('-FS$ 30.25')
  })
})

// ── 5. Fonte unica de preco (UX-001) ─────────────────────────────────────────
test('nenhum valor monetario do lado SELL deriva de tick.lastPrice', async () => {
  mockTickPrice = 999.99
  queuePreviewDto({ avgPrice: 10, currentPrice: 12.5 })

  const { container } = await renderSellReady()
  setQuantity('4')

  const texto = container.textContent ?? ''
  expect(texto).not.toContain('999')
  expect(screen.getByTestId('order-sell-current-price').textContent).toContain('FS$ 12.50')
  // cabecalho, valor da operacao e taxa saem do mesmo preco do preview
  expect(texto).toContain('Preço atual: FS$ 12.50')
  expect(texto).toContain('FS$ 50.00')
})

// ── 6. Atraso de cotacao ─────────────────────────────────────────────────────
test('plano JOGADOR ve o horario de referencia e o aviso de atraso', async () => {
  mockPlan = 'JOGADOR'
  queuePreviewDto({
    currentPriceAsOf: '2026-08-24T14:30:00.000Z',
    isPriceDelayed: true,
    priceDelayMinutes: 60,
  })

  await renderSellReady()

  const aviso = screen.getByTestId('order-sell-price-as-of').textContent ?? ''
  expect(aviso).toContain('11:30') // 14:30 UTC em BRT
  expect(aviso).toContain('atraso de 60 min')
})

// ── 7. Recuperabilidade por codigo de erro (UX-006) ──────────────────────────
describe('recuperabilidade dos erros do preview', () => {
  const casos = [
    { code: 'AUTH-001', status: 401, retry: false, reauth: true, trecho: 'Sessão expirada' },
    { code: 'STAFF_CANNOT_TRADE', status: 403, retry: false, reauth: false, trecho: 'administrativas' },
    { code: 'ASSET_080', status: 404, retry: false, reauth: false, trecho: 'não encontrado' },
    { code: 'ASSET_051', status: 422, retry: false, reauth: false, trecho: 'inválido' },
    { code: 'PRICE_BUFFERING', status: 503, retry: true, reauth: false, trecho: 'buffer de preços' },
    { code: 'SYS-001', status: 500, retry: true, reauth: false, trecho: 'carregar sua posição' },
  ] as const

  test.each(casos)('$code oferece a acao correspondente', async ({ code, status, retry, reauth, trecho }) => {
    queuePreview(fakeResponse({ error: { code, message: 'erro' } }, status))

    renderSell()
    const bloco = await screen.findByTestId('order-sell-inventory-error')

    expect(bloco.textContent).toContain(trecho)
    expect(screen.queryByTestId('order-sell-inventory-retry') !== null).toBe(retry)
    expect(screen.queryByTestId('order-sell-inventory-reauth') !== null).toBe(reauth)
    expect(submitButton().disabled).toBe(true)
  })

  test('a quantidade digitada sobrevive ao erro do preview', async () => {
    queuePreview(
      fakeResponse({ data: previewDto() }),
      fakeResponse({ error: { code: 'SYS-001', message: 'erro' } }, 500),
    )

    await renderSellReady()
    setQuantity('7')

    // segunda chamada falha; o valor digitado permanece
    fireEvent.click(screen.getByTestId('order-sell-max'))
    expect((screen.getByTestId('order-quantity-input') as HTMLInputElement).value).toBe('10')
    setQuantity('7')
    expect((screen.getByTestId('order-quantity-input') as HTMLInputElement).value).toBe('7')
  })
})

// ── 8. Conflito ORDER_050 no POST ────────────────────────────────────────────
test('ORDER_050 mantem o modal aberto, recarrega o preview e mostra os numeros novos', async () => {
  const onClose = jest.fn()
  queuePreview(
    fakeResponse({ data: previewDto({ ownedQty: 10, availableQty: 10 }) }),
    fakeResponse({ data: previewDto({ ownedQty: 10, reservedQty: 7, availableQty: 3 }) }),
  )
  queueOrder(fakeResponse({ error: { code: 'ORDER_050', message: 'posicao insuficiente' } }, 409))

  render(<OrderForm ticker="URU3" side="SELL" fsBalance={10_000} onClose={onClose} />)
  await screen.findByTestId('order-sell-available-qty')
  setQuantity('5')

  fireEvent.click(submitButton())

  await waitFor(() => expect(screen.getByTestId('order-sell-available-qty').textContent).toContain('3'))
  expect(previewCalls().length).toBe(2)
  expect(screen.getByTestId('order-sell-reserved-qty').textContent).toContain('7')
  expect(onClose).not.toHaveBeenCalled()
  expect(mockToastError).toHaveBeenCalled()
  // a quantidade digitada agora excede o disponivel e o submit trava
  expect(screen.getByTestId('order-sell-exceeds')).toBeTruthy()
  expect(submitButton().disabled).toBe(true)
})

// ── 9. Envio em uma etapa e feedback de sucesso (UX-005, decisao 12) ─────────
test('o clique no submit dispara o POST na mesma interacao e o sucesso traz status e CTA', async () => {
  const onClose = jest.fn()
  queuePreviewDto({ ownedQty: 10, availableQty: 10 })
  queueOrder(fakeResponse({ data: { order: { id: 'ord-9', status: 'PARTIAL' } } }, 201))

  render(<OrderForm ticker="URU3" side="SELL" fsBalance={10_000} onClose={onClose} />)
  await screen.findByTestId('order-sell-available-qty')
  setQuantity('4')

  fireEvent.click(submitButton())

  await waitFor(() => expect(postCalls().length).toBe(1))
  // Nenhuma etapa intermediaria: o POST saiu no primeiro clique.
  await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())

  const [mensagem, opcoes] = mockToastSuccess.mock.calls[0] as [string, { action?: { label: string; onClick: () => void } }]
  expect(mensagem).toContain('Ordem de venda de URU3 enviada!')
  expect(mensagem).toContain('Status: Parcial')
  expect(opcoes.action?.label).toBe('Ver ordem')
  expect(typeof opcoes.action?.onClick).toBe('function')
  await waitFor(() => expect(onClose).toHaveBeenCalled())
})

// ── 10. Nome acessivel e saida visivel do dialogo (UX-004) ───────────────────
describe('dialogo de ordem', () => {
  test('o Modal com title expoe #modal-title e o botao de fechar', async () => {
    queuePreviewDto({})

    const { container } = render(
      <Modal isOpen onClose={() => {}} title="Vender URU3" description="Uruguaiana FC">
        <OrderForm ticker="URU3" side="SELL" fsBalance={10_000} showHeading={false} />
      </Modal>,
    )
    await screen.findByTestId('order-sell-available-qty')

    const titulo = container.querySelector('#modal-title')
    expect(titulo?.textContent).toBe('Vender URU3')
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe('modal-title')
    expect(screen.getByTestId('modal-close-button')).toBeTruthy()
    // sem cabecalho duplicado dentro do formulario
    expect(screen.queryAllByRole('heading', { name: /vender URU3/i }).length).toBe(1)
  })

  test('AssetDetailPage passa title ao Modal que envolve o OrderForm', () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), 'src/components/market/AssetDetailPage.tsx'),
      'utf-8',
    )
    const trecho = fonte.slice(fonte.indexOf('{orderFormOpen && ('), fonte.indexOf('</Modal>', fonte.indexOf('{orderFormOpen && (')))
    expect(trecho).toContain('title={')
    expect(trecho).toContain('<OrderForm')
  })
})
