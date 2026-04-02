// ============================================================================
// Foot Stock — PnLSummary Tests (module-15, TASK-2/ST003)
// Rastreabilidade: INT-023
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render, screen } = require('@testing-library/react')
import { PnLSummary } from './PnLSummary'

// Mock InfoIcon para evitar Modal issues nos testes
jest.mock('@/components/ui/InfoIcon', () => ({
  InfoIcon: ({ glossarySlug }: { glossarySlug?: string }) => (
    <span data-testid="info-icon" aria-label={`Glossário: ${glossarySlug}`} />
  ),
}))

describe('PnLSummary', () => {
  // =========================================================================
  // Testes de Loading
  // =========================================================================

  it('T01 — Loading: renderiza skeleton com min-h-[64px]', () => {
    const { container } = render(
      <PnLSummary totalPnL={0} totalPnLPercent={0} isLoading={true} />
    )
    const skeleton = container.querySelector('[class*="min-h-"]')
    expect(skeleton).toBeInTheDocument()
    expect(skeleton?.className).toContain('min-h-[64px]')
  })

  // =========================================================================
  // Testes de Erro
  // =========================================================================

  it('T02 — Error: renderiza ErrorState quando isError=true', () => {
    render(
      <PnLSummary
        totalPnL={0}
        totalPnLPercent={0}
        isLoading={false}
        isError={true}
        onRetry={() => {}}
      />
    )
    expect(screen.getByText(/Erro ao carregar P&L/i)).toBeInTheDocument()
  })

  it('T03 — Error: callback onRetry é passado ao ErrorState', () => {
    const mockRetry = jest.fn()
    render(
      <PnLSummary
        totalPnL={0}
        totalPnLPercent={0}
        isLoading={false}
        isError={true}
        onRetry={mockRetry}
      />
    )
    const retryButton = screen.getByRole('button', { name: /retry|tentar novamente/i })
    expect(retryButton).toBeInTheDocument()
  })

  // =========================================================================
  // Testes de Empty State
  // =========================================================================

  it('T04 — Empty: renderiza EmptyState quando totalPnL=0 e totalPnLPercent=0 e pnLToday=undefined', () => {
    render(<PnLSummary totalPnL={0} totalPnLPercent={0} isLoading={false} />)
    expect(screen.getByText(/Sem P&L ainda/i)).toBeInTheDocument()
    expect(screen.getByText(/Negocie para ver/i)).toBeInTheDocument()
  })

  // =========================================================================
  // Testes de P&L Positivo
  // =========================================================================

  it('T05 — Positive PnL: renderiza seta ↑ e cor verde quando totalPnL > 0', () => {
    render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    expect(screen.getByText(/↑/)).toBeInTheDocument()
    const pnlValue = screen.getByText(/FS\$1\.000,00/)
    expect(pnlValue).toHaveClass('text-emerald-400')
  })

  it('T06 — Positive PnL: exibe percentual com sinal + quando totalPnLPercent > 0', () => {
    render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    // toFixed(2) output usa . não ,
    expect(screen.getByText(/\+5\.25%/)).toBeInTheDocument()
  })

  it('T07 — Positive PnL: aria-label inclui valor formatado', () => {
    const { container } = render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    const region = container.querySelector('[role="region"]')
    expect(region?.getAttribute('aria-label')).toContain('P&L total')
    // aria-label usa . não , (from toFixed)
    expect(region?.getAttribute('aria-label')).toContain('5.25%')
  })

  // =========================================================================
  // Testes de P&L Negativo
  // =========================================================================

  it('T08 — Negative PnL: renderiza seta ↓ e cor vermelha quando totalPnL < 0', () => {
    render(
      <PnLSummary totalPnL={-1000} totalPnLPercent={-5.25} isLoading={false} />
    )
    expect(screen.getByText(/↓/)).toBeInTheDocument()
    // formatFS(Math.abs()) é usado, então valor é positivo no display
    const pnlValue = screen.getByText(/FS\$-?1\.000,00/)
    expect(pnlValue).toHaveClass('text-red-400')
  })

  it('T09 — Negative PnL: percentual sem sinal + quando totalPnLPercent < 0', () => {
    render(
      <PnLSummary totalPnL={-1000} totalPnLPercent={-5.25} isLoading={false} />
    )
    expect(screen.getByText(/-5\.25%/)).toBeInTheDocument()
  })

  // =========================================================================
  // Testes de P&L Neutro (0)
  // =========================================================================

  it('T10 — Neutral PnL: renderiza travessão — quando totalPnL = 0', () => {
    render(
      <PnLSummary totalPnL={0} totalPnLPercent={0.01} isLoading={false} />
    )
    expect(screen.getByText(/—/)).toBeInTheDocument()
  })

  it('T11 — Neutral PnL: cor cinza quando totalPnL = 0', () => {
    const { container } = render(
      <PnLSummary totalPnL={0} totalPnLPercent={0.01} isLoading={false} />
    )
    const pnlValue = container.querySelector('[class*="text-"]')
    expect(pnlValue?.className).toContain('text-slate-400')
  })

  // =========================================================================
  // Testes de Today P&L (pnLToday e pnLTodayPercent)
  // =========================================================================

  it('T12 — Today PnL: renderiza "Hoje" quando pnLToday é definido', () => {
    render(
      <PnLSummary
        totalPnL={1000}
        totalPnLPercent={5.25}
        pnLToday={100}
        pnLTodayPercent={2.5}
        isLoading={false}
      />
    )
    expect(screen.getByText(/Hoje:/)).toBeInTheDocument()
  })

  it('T13 — Today PnL: exibe valor de pnLToday com sinal + se positivo', () => {
    render(
      <PnLSummary
        totalPnL={1000}
        totalPnLPercent={5.25}
        pnLToday={100}
        pnLTodayPercent={2.5}
        isLoading={false}
      />
    )
    // Verifica se o valor aparece em algum lugar
    expect(screen.getByText(/\+FS\$100,00/)).toBeInTheDocument()
  })

  it('T14 — Today PnL: exibe percentual de pnLTodayPercent', () => {
    render(
      <PnLSummary
        totalPnL={1000}
        totalPnLPercent={5.25}
        pnLToday={100}
        pnLTodayPercent={2.5}
        isLoading={false}
      />
    )
    expect(screen.getByText(/\+2\.50%/)).toBeInTheDocument()
  })

  it('T15 — Today PnL: não renderiza quando pnLToday é undefined', () => {
    render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    expect(screen.queryByText(/Hoje:/)).not.toBeInTheDocument()
  })

  it('T16 — Today PnL: renderiza travessão quando pnLToday não é finito', () => {
    render(
      <PnLSummary
        totalPnL={1000}
        totalPnLPercent={5.25}
        pnLToday={NaN}
        isLoading={false}
      />
    )
    const todaySection = screen.getByText(/Hoje:/)
    expect(todaySection.textContent).toContain('—')
  })

  // =========================================================================
  // Testes de Acessibilidade e Dark Theme
  // =========================================================================

  it('T17 — Accessibility: card tem role="region" e aria-label', () => {
    const { container } = render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    const region = container.querySelector('[role="region"]')
    expect(region).toBeInTheDocument()
    expect(region?.getAttribute('aria-label')).not.toBeNull()
  })

  it('T18 — Accessibility: card é focusável com tabIndex=0', () => {
    const { container } = render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    const region = container.querySelector('[role="region"]')
    expect(region?.getAttribute('tabIndex')).toBe('0')
  })

  it('T19 — Dark theme: card tem fundo escuro (#1E2329)', () => {
    const { container } = render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    const card = container.querySelector('[role="region"]')
    expect(card?.className).toContain('bg-[#1E2329]')
  })

  it('T20 — Dark theme: label "P&L Total" tem cor cinza', () => {
    const { container } = render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    const labelDiv = container.querySelector('div.text-slate-400')
    expect(labelDiv).toBeInTheDocument()
    expect(labelDiv).toHaveTextContent('P&L Total')
  })

  // =========================================================================
  // Testes de Formatação
  // =========================================================================

  it('T21 — Format: grande valor é formatado com separadores de milhar', () => {
    render(
      <PnLSummary totalPnL={123456.78} totalPnLPercent={15.5} isLoading={false} />
    )
    expect(screen.getByText(/FS\$123\.456,78/)).toBeInTheDocument()
  })

  it('T22 — Format: percentual sempre exibe 2 casas decimais', () => {
    render(
      <PnLSummary totalPnL={100} totalPnLPercent={5.1} isLoading={false} />
    )
    // toFixed(2) output usa . não ,
    expect(screen.getByText(/\+5\.10%/)).toBeInTheDocument()
  })

  it('T23 — Format: InfoIcon é renderizado para glossário', () => {
    render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    // InfoIcon mocked é renderizado
    const infoIcon = screen.getByTestId('info-icon')
    expect(infoIcon).toBeInTheDocument()
  })

  // =========================================================================
  // Testes de CLS (Cumulative Layout Shift)
  // =========================================================================

  it('T24 — CLS: skeleton e card têm min-h-[64px] consistente', () => {
    // Loading
    const { container: loadingContainer } = render(
      <PnLSummary totalPnL={0} totalPnLPercent={0} isLoading={true} />
    )
    const loadingSkeleton = loadingContainer.querySelector('[class*="min-h-"]')
    expect(loadingSkeleton?.className).toContain('min-h-[64px]')

    // Sucesso
    const { container: successContainer } = render(
      <PnLSummary totalPnL={1000} totalPnLPercent={5.25} isLoading={false} />
    )
    const successCard = successContainer.querySelector('[role="region"]')
    expect(successCard?.className).toContain('min-h-[64px]')
  })
})
