/** @jest-environment jsdom */
// ============================================================================
// FootStock — OrderHistory: drill-down, estados e cancelamento seguro
// Cobre os criterios 5, 13 e 18 do brainstorm 08-24 e as regras UX-006/UX-010.
// ============================================================================

import { render, screen, fireEvent, within } from '@testing-library/react'
import { OrderHistory } from '@/components/orders/OrderHistory'
import type { OrderHistoryDto } from '@/lib/contracts/order-history-contract'

// ── Mocks ────────────────────────────────────────────────────────────────────

interface QueryState {
  data?: { data: OrderHistoryDto[]; pagination: Record<string, number> }
  isLoading: boolean
  isError: boolean
  isFetching: boolean
}

let queryState: QueryState
const mockRefetch = jest.fn()
const mockInvalidate = jest.fn()
let mutationFn: (id: string) => Promise<unknown>

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ ...queryState, refetch: mockRefetch }),
  useMutation: (options: { mutationFn: (id: string) => Promise<unknown> }) => {
    mutationFn = options.mutationFn
    return {
      // `mutate` real: dispara o mutationFn para que o teste observe (ou nao)
      // a chamada DELETE no fetch global.
      mutate: (id: string) => { void mutationFn(id) },
      isPending: false,
    }
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Rotulo unico de ausencia de dado usado pelo componente.
const UNAVAILABLE_TEXT = 'Indisponível'

function pagination(totalPages = 1) {
  return { page: 1, limit: 10, total: totalPages * 10, totalPages }
}

// Ordem executada com liquidacao registrada (fonte TRADE).
const filledOrder: OrderHistoryDto = {
  id: 'ord-filled',
  assetId: 'asset-1',
  asset: { ticker: 'URU3', displayName: 'Uruguaiana FC' },
  type: 'LIMIT',
  side: 'SELL',
  status: 'FILLED',
  quantity: 10,
  requestedPrice: 12.0,
  executedPrice: 12.5,
  fee: 0.35,
  feeKind: 'EXECUTED',
  grossAmount: 125,
  cashDelta: 124.65,
  netAmount: 124.65,
  financialSource: 'TRADE',
  createdAt: '2026-08-24T14:30:00.000Z',
  executedAt: '2026-08-24T14:31:10.000Z',
  scheduledAt: null,
  groupId: null,
  avgPriceAtExecution: 10,
  costBasisAmount: 100,
  realizedPnl: 25,
  pnlProvenance: 'PERSISTED',
}

// Ordem aberta: solicitada, nunca executada.
const openOrder: OrderHistoryDto = {
  id: 'ord-open',
  assetId: 'asset-2',
  asset: { ticker: 'FLA3', displayName: 'Flamengo' },
  type: 'LIMIT',
  side: 'BUY',
  status: 'OPEN',
  quantity: 5,
  requestedPrice: 9.5,
  executedPrice: null,
  fee: 0.25,
  feeKind: 'ESTIMATED',
  grossAmount: null,
  cashDelta: null,
  netAmount: null,
  financialSource: 'NONE',
  createdAt: '2026-08-24T15:00:00.000Z',
  executedAt: null,
  scheduledAt: null,
  groupId: null,
  avgPriceAtExecution: null,
  costBasisAmount: null,
  realizedPnl: null,
  pnlProvenance: 'UNAVAILABLE',
}

// Ordem parcial: parte executada, saldo em aberto.
const partialOrder: OrderHistoryDto = {
  ...filledOrder,
  id: 'ord-partial',
  status: 'PARTIAL',
  side: 'SELL',
}

const cancelledOrder: OrderHistoryDto = {
  ...openOrder,
  id: 'ord-cancelled',
  status: 'CANCELLED',
}

// Ordem legada: executada, porem sem liquidacao registrada e sem taxa conhecida.
const legacyOrder: OrderHistoryDto = {
  id: 'ord-legacy',
  assetId: 'asset-3',
  asset: null,
  type: 'MARKET',
  side: 'BUY',
  status: 'FILLED',
  quantity: 4,
  requestedPrice: null,
  executedPrice: 20,
  fee: null,
  feeKind: null,
  grossAmount: 80,
  cashDelta: null,
  netAmount: -80,
  financialSource: 'ORDER_FALLBACK',
  createdAt: '2026-01-10T12:00:00.000Z',
  executedAt: '2026-01-10T12:00:05.000Z',
  scheduledAt: null,
  groupId: null,
  avgPriceAtExecution: null,
  costBasisAmount: null,
  realizedPnl: null,
  pnlProvenance: 'UNAVAILABLE',
}

function renderWith(orders: OrderHistoryDto[], totalPages = 1) {
  queryState = {
    data: { data: orders, pagination: pagination(totalPages) },
    isLoading: false,
    isError: false,
    isFetching: false,
  }
  return render(<OrderHistory />)
}

function expand(id: string) {
  fireEvent.click(screen.getByTestId(`order-row-expand-${id}`))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
  queryState = { data: undefined, isLoading: false, isError: false, isFetching: false }
})

// ── Estados ──────────────────────────────────────────────────────────────────

describe('OrderHistory — estados', () => {
  test('loading mostra esqueleto e nao mostra vazio', () => {
    queryState = { data: undefined, isLoading: true, isError: false, isFetching: true }
    render(<OrderHistory />)

    expect(screen.getByTestId('order-history-loading')).toBeTruthy()
    expect(screen.queryByText('Nenhuma ordem encontrada')).toBeNull()
  })

  test('vazio mostra EmptyState quando a requisicao deu certo', () => {
    renderWith([])

    expect(screen.getByTestId('order-history-empty')).toBeTruthy()
    expect(screen.getByText('Nenhuma ordem encontrada')).toBeTruthy()
    expect(screen.queryByTestId('order-history-error')).toBeNull()
  })

  // UX-006 / Zero Silencio: falha nao pode virar "voce nao tem ordens".
  test('erro mostra alerta com retry e NAO mostra "Nenhuma ordem encontrada"', () => {
    queryState = { data: undefined, isLoading: false, isError: true, isFetching: false }
    render(<OrderHistory />)

    const alerta = screen.getByTestId('order-history-error')
    expect(alerta.getAttribute('role')).toBe('alert')
    expect(screen.queryByText('Nenhuma ordem encontrada')).toBeNull()
    expect(screen.queryByTestId('order-history-empty')).toBeNull()

    fireEvent.click(screen.getByTestId('order-history-retry'))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  test('sucesso renderiza uma linha por ordem', () => {
    renderWith([filledOrder, openOrder, cancelledOrder, legacyOrder])

    expect(screen.getByTestId('order-history-success')).toBeTruthy()
    for (const order of [filledOrder, openOrder, cancelledOrder, legacyOrder]) {
      expect(screen.getByTestId(`order-row-${order.id}`)).toBeTruthy()
      expect(screen.getByTestId(`order-status-${order.id}`)).toBeTruthy()
    }
  })

  test('preserva os data-testid existentes order-row e cancel-btn', () => {
    renderWith([openOrder, partialOrder, filledOrder])

    expect(screen.getByTestId(`order-row-${openOrder.id}`)).toBeTruthy()
    expect(screen.getByTestId(`cancel-btn-${openOrder.id}`)).toBeTruthy()
    expect(screen.getByTestId(`cancel-btn-${partialOrder.id}`)).toBeTruthy()
    // Ordem ja executada nao expoe cancelar.
    expect(screen.queryByTestId(`cancel-btn-${filledOrder.id}`)).toBeNull()
  })
})

// ── Drill-down ───────────────────────────────────────────────────────────────

describe('OrderHistory — drill-down', () => {
  // UX-010: controle nativo com estado anunciado.
  test('order-row-expand e button com aria-expanded e aria-controls', () => {
    renderWith([filledOrder])
    const botao = screen.getByTestId(`order-row-expand-${filledOrder.id}`)

    expect(botao.tagName).toBe('BUTTON')
    expect(botao.getAttribute('type')).toBe('button')
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(botao.getAttribute('aria-controls')).toBe(`order-details-${filledOrder.id}`)
    expect(screen.queryByTestId(`order-details-${filledOrder.id}`)).toBeNull()

    // Operavel por teclado: recebe foco e responde ao acionamento do botao nativo.
    ;(botao as HTMLButtonElement).focus()
    expect(document.activeElement).toBe(botao)
    fireEvent.click(botao)

    expect(botao.getAttribute('aria-expanded')).toBe('true')
    const detalhes = screen.getByTestId(`order-details-${filledOrder.id}`)
    expect(detalhes.id).toBe(botao.getAttribute('aria-controls'))

    fireEvent.click(botao)
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId(`order-details-${filledOrder.id}`)).toBeNull()
  })

  // Criterio 5: solicitado x executado.
  test('detalhe distingue preco e hora solicitados de executados', () => {
    renderWith([filledOrder])
    expand(filledOrder.id)

    const detalhes = screen.getByTestId(`order-details-${filledOrder.id}`)
    const texto = detalhes.textContent ?? ''

    expect(texto).toContain('Preço solicitado')
    expect(texto).toContain('FS$ 12.00')
    expect(texto).toContain('Enviada em')

    const precoExec = screen.getByTestId(`order-executed-price-${filledOrder.id}`)
    expect(precoExec.textContent).toBe('FS$ 12.50')

    const horaExec = screen.getByTestId(`order-executed-at-${filledOrder.id}`)
    expect(horaExec.textContent).toContain('24/08/2026')
    expect(horaExec.textContent).toContain('11:31')
    expect(horaExec.textContent).not.toBe(UNAVAILABLE_TEXT)
  })

  test('detalhe mostra bruto, taxa com origem e liquido', () => {
    renderWith([filledOrder])
    expand(filledOrder.id)

    expect(screen.getByTestId(`order-gross-${filledOrder.id}`).textContent).toBe('FS$ 125.00')
    expect(screen.getByTestId(`order-fee-${filledOrder.id}`).textContent).toBe(
      'FS$ 0.35 (taxa cobrada)',
    )
    expect(screen.getByTestId(`order-net-${filledOrder.id}`).textContent).toBe('+FS$ 124.65')
    expect(screen.getByTestId(`order-details-${filledOrder.id}`).textContent).toContain(
      'Valores conferidos na liquidação',
    )
  })

  test('ordem sem execucao nao inventa numero', () => {
    renderWith([openOrder])
    expand(openOrder.id)

    expect(screen.getByTestId(`order-executed-price-${openOrder.id}`).textContent).toBe(
      UNAVAILABLE_TEXT,
    )
    expect(screen.getByTestId(`order-executed-at-${openOrder.id}`).textContent).toBe(
      UNAVAILABLE_TEXT,
    )
    expect(screen.getByTestId(`order-gross-${openOrder.id}`).textContent).toBe(UNAVAILABLE_TEXT)
    expect(screen.getByTestId(`order-net-${openOrder.id}`).textContent).toBe(UNAVAILABLE_TEXT)
    expect(screen.getByTestId(`order-details-${openOrder.id}`).textContent).toContain(
      'não foi executada',
    )
    // O preco solicitado continua visivel: ele existe.
    expect(screen.getByTestId(`order-details-${openOrder.id}`).textContent).toContain('FS$ 9.50')
  })

  test('ordem legada sem liquidacao rotula indisponivel e avisa que e estimativa', () => {
    renderWith([legacyOrder])
    expand(legacyOrder.id)

    const detalhes = screen.getByTestId(`order-details-${legacyOrder.id}`)
    expect(screen.getByTestId(`order-fee-${legacyOrder.id}`).textContent).toBe(UNAVAILABLE_TEXT)
    // Zero fabricado seria mentira: nao pode aparecer no lugar da taxa.
    expect(screen.getByTestId(`order-fee-${legacyOrder.id}`).textContent).not.toContain('0.00')
    expect(detalhes.textContent).toContain('Liquidação não registrada')
    // Compra: liquido negativo.
    expect(screen.getByTestId(`order-net-${legacyOrder.id}`).textContent).toBe('-FS$ 80.00')
    // Ordem a mercado nao tem preco solicitado, e isso e dito com todas as letras.
    expect(detalhes.textContent).toContain('Ordem a mercado')
  })

  test('ordem cancelada renderiza sem quebrar e sem valores de liquidacao', () => {
    renderWith([cancelledOrder])
    expand(cancelledOrder.id)

    expect(screen.getByTestId(`order-status-${cancelledOrder.id}`).textContent).toBe('Cancelada')
    expect(screen.getByTestId(`order-net-${cancelledOrder.id}`).textContent).toBe(UNAVAILABLE_TEXT)
  })

  test('varias ordens podem ficar abertas ao mesmo tempo', () => {
    renderWith([filledOrder, openOrder])
    expand(filledOrder.id)
    expand(openOrder.id)

    expect(screen.getByTestId(`order-details-${filledOrder.id}`)).toBeTruthy()
    expect(screen.getByTestId(`order-details-${openOrder.id}`)).toBeTruthy()
  })
})

// ── Paginacao ────────────────────────────────────────────────────────────────

describe('OrderHistory — paginacao', () => {
  // UX-010: botoes so com icone precisam de nome acessivel.
  test('os dois controles tem nome acessivel', () => {
    renderWith([filledOrder], 3)

    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeTruthy()
  })
})

// ── Cancelamento ─────────────────────────────────────────────────────────────

function deleteCalls() {
  return mockFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === 'DELETE',
  )
}

describe('OrderHistory — cancelamento', () => {
  // Decisao 13 do fonte: OPEN e reversivel na pratica, segue em clique unico.
  test('ordem OPEN cancela em clique unico, sem dialogo', () => {
    renderWith([openOrder])
    fireEvent.click(screen.getByTestId(`cancel-btn-${openOrder.id}`))

    expect(screen.queryByTestId('cancel-confirm-dialog')).toBeNull()
    expect(deleteCalls()).toHaveLength(1)
    expect(deleteCalls()[0][0]).toBe(`/api/v1/orders/${openOrder.id}`)
  })

  // Criterio 18 do fonte: PARTIAL exige confirmacao explicita.
  test('ordem PARTIAL abre confirmacao com ticker, lado e aviso, sem DELETE antes', () => {
    renderWith([partialOrder])
    fireEvent.click(screen.getByTestId(`cancel-btn-${partialOrder.id}`))

    const dialogo = screen.getByTestId('cancel-confirm-dialog')
    const texto = dialogo.textContent ?? ''
    expect(texto).toContain('URU3')
    expect(texto).toContain('venda')
    expect(texto).toContain('não será desfeita')
    // Nenhum DELETE disparado enquanto o usuario nao confirma.
    expect(deleteCalls()).toHaveLength(0)

    fireEvent.click(within(dialogo).getByTestId('cancel-confirm-btn'))
    expect(deleteCalls()).toHaveLength(1)
    expect(deleteCalls()[0][0]).toBe(`/api/v1/orders/${partialOrder.id}`)
    expect(screen.queryByTestId('cancel-confirm-dialog')).toBeNull()
  })

  test('manter ordem fecha o dialogo sem cancelar', () => {
    renderWith([partialOrder])
    fireEvent.click(screen.getByTestId(`cancel-btn-${partialOrder.id}`))
    fireEvent.click(screen.getByTestId('cancel-dismiss-btn'))

    expect(screen.queryByTestId('cancel-confirm-dialog')).toBeNull()
    expect(deleteCalls()).toHaveLength(0)
  })
})
