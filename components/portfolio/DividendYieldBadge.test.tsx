// ============================================================================
// Foot Stock — DividendYieldBadge Tests (module-16, TASK-2/ST003)
// Rastreabilidade: INT-074
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render, screen } = require('@testing-library/react')
import { DividendYieldBadge } from './DividendYieldBadge'
import { PLAN_TYPE } from '@/lib/enums'

describe('DividendYieldBadge', () => {
  it('T01 — JOGADOR: retorna null (sem badge)', () => {
    const { container } = render(<DividendYieldBadge plan={PLAN_TYPE.JOGADOR} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('T02 — CRAQUE: renderiza badge de Yield Financeiro Automático', () => {
    render(<DividendYieldBadge plan={PLAN_TYPE.CRAQUE} />)
    expect(screen.getByText('Yield Financeiro Automático')).toBeInTheDocument()
  })

  it('T03 — LENDA: renderiza badge de Yield Esportivo + Financeiro Automático', () => {
    render(<DividendYieldBadge plan={PLAN_TYPE.LENDA} />)
    expect(screen.getByText('Yield Esportivo + Financeiro Automático')).toBeInTheDocument()
  })

  it('T04 — CRAQUE: badge tem cor azul (#F0B90B)', () => {
    const { container } = render(<DividendYieldBadge plan={PLAN_TYPE.CRAQUE} />)
    const badge = container.querySelector('[aria-describedby="yield-tooltip-craque"]')
    expect(badge).not.toBeNull()
    expect(badge?.className).toContain('text-[#F0B90B]')
  })

  it('T05 — LENDA: badge tem cor dourada (#F0B90B)', () => {
    const { container } = render(<DividendYieldBadge plan={PLAN_TYPE.LENDA} />)
    const badge = container.querySelector('[aria-describedby="yield-tooltip-lenda"]')
    expect(badge).not.toBeNull()
    expect(badge?.className).toContain('text-[#F0B90B]')
  })

  it('T06 — CRAQUE: tooltip tem role="tooltip" e id correto', () => {
    render(<DividendYieldBadge plan={PLAN_TYPE.CRAQUE} />)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveAttribute('id', 'yield-tooltip-craque')
    expect(tooltip).toHaveTextContent('0,5% ao mês')
  })

  it('T07 — LENDA: tooltip menciona dividendos esportivos e financeiros', () => {
    render(<DividendYieldBadge plan={PLAN_TYPE.LENDA} />)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveAttribute('id', 'yield-tooltip-lenda')
    expect(tooltip).toHaveTextContent('esportivos')
    expect(tooltip).toHaveTextContent('financeiros')
  })

  it('T08 — CRAQUE: exibe ícone do plano Craque', () => {
    render(<DividendYieldBadge plan={PLAN_TYPE.CRAQUE} />)
    // PlanIcon usa SVG com aria-label
    expect(screen.getByLabelText('Plano Craque')).toBeInTheDocument()
  })

  it('T09 — LENDA: exibe ícone do plano Lenda', () => {
    render(<DividendYieldBadge plan={PLAN_TYPE.LENDA} />)
    // PlanIcon usa SVG com aria-label
    expect(screen.getByLabelText('Plano Lenda')).toBeInTheDocument()
  })

  it('T10 — className extra é aplicado ao container', () => {
    const { container } = render(
      <DividendYieldBadge plan={PLAN_TYPE.CRAQUE} className="mt-4" />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper?.className).toContain('mt-4')
  })
})
