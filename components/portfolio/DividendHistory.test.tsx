// ============================================================================
// Foot Stock — DividendHistory Tests (module-16, TASK-2/ST002)
// Testa listagem paginada, filtros, estados (loading/error/empty), badges de
// tipo/status, botão de reinvestimento e acessibilidade mobile-first.
// Rastreabilidade: INT-072, INT-073, INT-074
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render, screen, fireEvent } = require('@testing-library/react')
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DividendRecord } from '@/hooks/useDividends'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/hooks/useDividends', () => ({
  useDividends: jest.fn(),
  useDividendTotalCredited: jest.fn(() => 0),
}))

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query')
  return {
    ...actual,
    useMutation: jest.fn(() => ({
      mutate: jest.fn(),
      isPending: false,
    })),
  }
})

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}))

jest.mock('@/lib/api/client', () => ({
  apiClient: { post: jest.fn().mockResolvedValue({}) },
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

jest.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, isOpen, title }: { children: React.ReactNode; isOpen: boolean; title: string }) =>
    isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
}))

const mockUseDividends = jest.requireMock('@/hooks/useDividends').useDividends
const mockUseDividendTotalCredited = jest.requireMock('@/hooks/useDividends').useDividendTotalCredited

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function makeDividend(overrides: Partial<DividendRecord> = {}): DividendRecord {
  return {
    id: 'div-1',
    userId: 'user-1',
    ticker: 'FLM',
    clubName: 'Urubu da Gávea',
    type: 'ESPORTIVO',
    amount: 12.00,
    yieldPercent: 1.2,
    status: 'CREDITED',
    processedMonth: null,
    scheduledFor: null,
    triggerEvent: 'VITORIA',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = makeQueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// Importar depois dos mocks
import { DividendHistory } from './DividendHistory'

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('DividendHistory', () => {
  beforeEach(() => {
    mockUseDividends.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    mockUseDividendTotalCredited.mockReturnValue(0)
  })

  // --- Estados ---

  it('T01 — estado loading: exibe 3 skeletons com aria-busy', () => {
    mockUseDividends.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByRole('status', { name: /carregando dividendos/i })).toBeInTheDocument()
  })

  it('T02 — estado error: exibe mensagem e botão de retry', () => {
    mockUseDividends.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: jest.fn() })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByText(/erro ao carregar dividendos/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument()
  })

  it('T03 — estado empty (sem dados): exibe EmptyState com link para Mercado', () => {
    mockUseDividends.mockReturnValue({
      data: { items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByText(/sem dividendos ainda/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ir para mercado/i })).toBeInTheDocument()
  })

  // --- Renderização de itens ---

  it('T04 — item ESPORTIVO: exibe badge dourado ⚽', () => {
    mockUseDividends.mockReturnValue({
      data: {
        items: [makeDividend({ type: 'ESPORTIVO', status: 'CREDITED' })],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    mockUseDividendTotalCredited.mockReturnValue(12.00)

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByLabelText(/tipo: esportivo/i)).toBeInTheDocument()
    expect(screen.getByText('FLM')).toBeInTheDocument()
    expect(screen.getByText(/\+/)).toBeInTheDocument()
  })

  it('T05 — item FINANCEIRO: exibe badge azul 📈', () => {
    mockUseDividends.mockReturnValue({
      data: {
        items: [makeDividend({ type: 'FINANCEIRO', status: 'CREDITED' })],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByLabelText(/tipo: financeiro/i)).toBeInTheDocument()
  })

  it('T06 — item CREDITED: exibe badge "Creditado" verde', () => {
    mockUseDividends.mockReturnValue({
      data: {
        items: [makeDividend({ status: 'CREDITED' })],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByText('Creditado')).toBeInTheDocument()
  })

  it('T07 — item PENDING: exibe prazo em dias e botão Reinvestir', () => {
    mockUseDividends.mockReturnValue({
      data: {
        items: [makeDividend({ status: 'PENDING', daysRemaining: 3 })],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByText(/expira em 3 dias/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reinvestir dividendo de flm/i })).toBeInTheDocument()
  })

  it('T08 — item PENDING com 0 dias: exibe "Expira hoje"', () => {
    mockUseDividends.mockReturnValue({
      data: {
        items: [makeDividend({ status: 'PENDING', daysRemaining: 0 })],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByText(/expira hoje/i)).toBeInTheDocument()
  })

  it('T09 — item EXPIRADO: exibe badge cinza sem urgência', () => {
    mockUseDividends.mockReturnValue({
      data: {
        items: [makeDividend({ status: 'EXPIRADO' })],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByText('Expirado')).toBeInTheDocument()
    // EXPIRADO não deve exibir botão reinvestir
    expect(screen.queryByRole('button', { name: /reinvestir/i })).toBeNull()
  })

  // --- Filtros ---

  it('T10 — filtros: renderiza "Todos", "Esportivos", "Financeiros" com aria-pressed', () => {
    mockUseDividends.mockReturnValue({
      data: { items: [makeDividend()], meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    // Multiple "Todos" buttons exist (type filter + status filter) — grab all
    const todoBtns = screen.getAllByRole('button', { name: /todos/i })
    expect(todoBtns.length).toBeGreaterThanOrEqual(1)
    expect(todoBtns[0]).toHaveAttribute('aria-pressed', 'true')

    const esportivoBtn = screen.getByRole('button', { name: /esportivos/i })
    expect(esportivoBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('T11 — filtro "Financeiros": atualiza aria-pressed ao clicar', () => {
    mockUseDividends.mockReturnValue({
      data: { items: [makeDividend()], meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    const finBtn = screen.getByRole('button', { name: /financeiros/i })
    fireEvent.click(finBtn)

    expect(finBtn).toHaveAttribute('aria-pressed', 'true')
    const todoBtns = screen.getAllByRole('button', { name: /todos/i })
    expect(todoBtns[0]).toHaveAttribute('aria-pressed', 'false')
  })

  // --- Paginação ---

  it('T12 — paginação: não exibe paginação quando totalPages = 1', () => {
    mockUseDividends.mockReturnValue({
      data: { items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.queryByRole('button', { name: /página anterior/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /próxima página/i })).toBeNull()
  })

  it('T13 — paginação: exibe navegação quando totalPages > 1', () => {
    mockUseDividends.mockReturnValue({
      data: { items: [makeDividend()], meta: { page: 1, pageSize: 20, totalItems: 21, totalPages: 2, hasNextPage: true, hasPreviousPage: false } },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByRole('button', { name: /ir para página anterior/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /ir para próxima página/i })).not.toBeDisabled()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  // --- Resumo ---

  it('T14 — total creditado: exibe quando > 0', () => {
    mockUseDividendTotalCredited.mockReturnValue(100.50)
    mockUseDividends.mockReturnValue({
      data: { items: [makeDividend()], meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByText(/total recebido/i)).toBeInTheDocument()
  })

  // --- Acessibilidade ---

  it('T15 — lista tem role="list" e itens têm role="listitem"', () => {
    mockUseDividends.mockReturnValue({
      data: { items: [makeDividend(), makeDividend({ id: 'div-2', ticker: 'VAR' })], meta: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('T16 — botão Reinvestir tem min-h-[44px] para touch targets mobile', () => {
    mockUseDividends.mockReturnValue({
      data: { items: [makeDividend({ status: 'PENDING', daysRemaining: 5 })], meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<DividendHistory />, { wrapper: Wrapper })

    const btn = screen.getByRole('button', { name: /reinvestir dividendo/i })
    expect(btn.className).toContain('min-h-[44px]')
  })
})
