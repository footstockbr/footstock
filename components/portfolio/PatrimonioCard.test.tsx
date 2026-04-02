// ============================================================================
// Foot Stock — PatrimonioCard Tests (module-15, TASK-2/ST002)
// Rastreabilidade: INT-023
// ============================================================================

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PatrimonioCard } from './PatrimonioCard'
import type { PortfolioSummary } from '@/types/portfolio'

// Mock usePortfolioSummary
jest.mock('@/hooks/usePortfolio', () => ({
  usePortfolioSummary: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { usePortfolioSummary } = require('@/hooks/usePortfolio')

describe('PatrimonioCard', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  function renderWithQuery(component: React.ReactElement) {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    )
  }

  // =========================================================================
  // T01 — Loading State
  // =========================================================================

  it('T01 — Loading: renderiza Skeleton com min-h-32 quando isLoading=true', () => {
    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    const { container } = renderWithQuery(
      <PatrimonioCard isLoading={true} />
    )
    const skeleton = container.querySelector('[class*="min-h-32"]')
    expect(skeleton).toBeInTheDocument()
    expect(skeleton?.className).toContain('w-full')
  })

  it('T02 — Loading: aria-label e role="status" presentes no skeleton', () => {
    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    renderWithQuery(<PatrimonioCard isLoading={true} />)
    const statusElement = screen.getByRole('status')
    expect(statusElement).toHaveAttribute('aria-busy', 'true')
    expect(statusElement).toHaveAttribute('aria-label', 'Carregando patrimônio')
  })

  // =========================================================================
  // T03 — Error State
  // =========================================================================

  it('T03 — Error: renderiza ErrorState quando isError=true', () => {
    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    })

    renderWithQuery(<PatrimonioCard />)
    expect(screen.getByText(/Erro ao carregar patrimônio total/i)).toBeInTheDocument()
  })

  it('T04 — Error: chama refetch ao clicar em retry', () => {
    const mockRefetch = jest.fn()
    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    })

    renderWithQuery(<PatrimonioCard />)
    const retryButton = screen.getByText(/tentar novamente/i)
    retryButton.click()
    expect(mockRefetch).toHaveBeenCalled()
  })

  // =========================================================================
  // T05 — Empty State
  // =========================================================================

  it('T05 — Empty: renderiza EmptyState quando data é null', () => {
    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    renderWithQuery(<PatrimonioCard summary={null} />)
    expect(screen.getByText(/Sem posições/i)).toBeInTheDocument()
    expect(screen.getByText(/Faça sua primeira ordem/i)).toBeInTheDocument()
  })

  it('T06 — Empty: min-h-32 e role="region" presentes', () => {
    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    renderWithQuery(
      <PatrimonioCard summary={null} />
    )
    const region = screen.getByRole('region')
    expect(region).toHaveAttribute('aria-label', 'Sem posições')
    expect(region?.className).toContain('min-h-32')
  })

  // =========================================================================
  // T07 — Success State
  // =========================================================================

  it('T07 — Success: renderiza valor total formatado', () => {
    const mockSummary: PortfolioSummary = {
      totalValue: 50000,
      totalPnL: 5000,
      totalPnLPercent: 11.11,
      pnLToday: 100,
      pnLTodayPercent: 0.2,
      largestPosition: 'VALE3',
      diversificationScore: 0.75,
    }

    usePortfolioSummary.mockReturnValue({
      data: mockSummary,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    renderWithQuery(<PatrimonioCard summary={mockSummary} />)
    expect(screen.getByText(/Patrimônio Total/i)).toBeInTheDocument()
  })

  it('T08 — Success: exibe PnL positivo em verde', () => {
    const mockSummary: PortfolioSummary = {
      totalValue: 50000,
      totalPnL: 5000,
      totalPnLPercent: 11.11,
      pnLToday: 100,
      pnLTodayPercent: 0.2,
      largestPosition: 'VALE3',
      diversificationScore: 0.75,
    }

    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    const { container } = renderWithQuery(
      <PatrimonioCard summary={mockSummary} />
    )
    const pnlText = container.querySelector('.text-emerald-400')
    expect(pnlText).toBeInTheDocument()
    expect(pnlText?.textContent).toContain('+11.11%')
  })

  it('T09 — Success: exibe PnL negativo em vermelho', () => {
    const mockSummary: PortfolioSummary = {
      totalValue: 50000,
      totalPnL: -5000,
      totalPnLPercent: -9.09,
      pnLToday: -100,
      pnLTodayPercent: -0.2,
      largestPosition: 'VALE3',
      diversificationScore: 0.75,
    }

    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    const { container } = renderWithQuery(
      <PatrimonioCard summary={mockSummary} />
    )
    const pnlText = container.querySelector('.text-red-400')
    expect(pnlText).toBeInTheDocument()
    expect(pnlText?.textContent).toContain('-9.09%')
  })

  it('T10 — Success: aria-label completo com valores', () => {
    const mockSummary: PortfolioSummary = {
      totalValue: 50000,
      totalPnL: 5000,
      totalPnLPercent: 11.11,
      pnLToday: 100,
      pnLTodayPercent: 0.2,
      largestPosition: 'VALE3',
      diversificationScore: 0.75,
    }

    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    renderWithQuery(<PatrimonioCard summary={mockSummary} />)
    const region = screen.getByRole('region')
    expect(region).toHaveAttribute('aria-label', expect.stringContaining('Patrimônio total'))
    expect(region).toHaveAttribute('aria-label', expect.stringContaining('11.11%'))
  })

  // =========================================================================
  // T11 — Focus & Accessibility
  // =========================================================================

  it('T11 — Accessibility: card tem focus outline com cor gold (#C9A84C)', () => {
    const mockSummary: PortfolioSummary = {
      totalValue: 50000,
      totalPnL: 5000,
      totalPnLPercent: 11.11,
      pnLToday: 100,
      pnLTodayPercent: 0.2,
      largestPosition: 'VALE3',
      diversificationScore: 0.75,
    }

    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    const { container } = renderWithQuery(
      <PatrimonioCard summary={mockSummary} />
    )
    const card = container.querySelector('[role="region"]')
    expect(card?.className).toContain('focus:outline-[#C9A84C]')
  })

  it('T12 — Accessibility: card é focusável (tabIndex=0)', () => {
    const mockSummary: PortfolioSummary = {
      totalValue: 50000,
      totalPnL: 5000,
      totalPnLPercent: 11.11,
      pnLToday: 100,
      pnLTodayPercent: 0.2,
      largestPosition: 'VALE3',
      diversificationScore: 0.75,
    }

    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    const { container } = renderWithQuery(
      <PatrimonioCard summary={mockSummary} />
    )
    const card = container.querySelector('[role="region"]')
    expect(card).toHaveAttribute('tabIndex', '0')
  })

  // =========================================================================
  // T13 — Responsive
  // =========================================================================

  it('T13 — Responsive: w-full em mobile, sm:w-auto em desktop', () => {
    const mockSummary: PortfolioSummary = {
      totalValue: 50000,
      totalPnL: 5000,
      totalPnLPercent: 11.11,
      pnLToday: 100,
      pnLTodayPercent: 0.2,
      largestPosition: 'VALE3',
      diversificationScore: 0.75,
    }

    usePortfolioSummary.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    const { container } = renderWithQuery(
      <PatrimonioCard summary={mockSummary} />
    )
    const card = container.querySelector('[role="region"]')
    expect(card?.className).toContain('w-full')
    expect(card?.className).toContain('sm:w-auto')
  })
})
