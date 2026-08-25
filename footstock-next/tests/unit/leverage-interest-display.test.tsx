/**
 * @jest-environment jsdom
 *
 * Task 20 — o percentual de juros de alavancagem exibido ao usuario deve derivar
 * de LEVERAGE_DAILY_INTEREST_RATE, nunca de literal. O bug corrigido: a mesma tela
 * de ordem mostrava tres numeros diferentes para a mesma taxa (card de atalho
 * 0,1%, que na verdade e FEE_RATES.LENDA; InfoTip do OrderForm 0,2%; e
 * LeverageToggle 0,3%, o unico correto). Este teste renderiza as tres superficies
 * juntas e falha se qualquer uma parar de acompanhar a constante.
 */
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { OrderForm } from '@/components/orders/OrderForm'
import {
  LEVERAGE_DAILY_INTEREST_RATE,
  LEVERAGE_DAILY_INTEREST_PERCENT_LABEL,
} from '@/lib/constants/leverage'
import { MarketSession } from '@/lib/constants/market'

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/hooks/usePlanGuard', () => ({
  usePlanGuard: () => ({
    plan: 'LENDA',
    isLoading: false,
    isError: false,
    isReady: true,
    hasAccess: () => true,
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
    tick: { lastPrice: 100 },
    connectionState: 'open',
    isBuffering: false,
    isOffline: false,
    error: null,
  }),
}))
jest.mock('@/hooks/useBalance', () => ({
  useBalance: () => ({ fsBalance: 10_000 }),
}))
jest.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({ track: jest.fn() }),
}))
jest.mock('@/components/orders/PriceHistoryChart', () => ({
  PriceHistoryChart: () => null,
}))
jest.mock('@/components/payments/PlanCTAButton', () => ({
  PlanCTAButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))

/**
 * Extrai o percentual que qualifica os JUROS num texto renderizado. Ancorado na
 * palavra "juros" de proposito: o InfoTip tambem cita "50% do nocional", que e o
 * LTV do credito e nao a taxa.
 */
function extrairPercentualDeJuros(texto: string | null | undefined): string | null {
  const m = (texto ?? '').match(/juros[^%]*?(\d+(?:,\d+)?%)/i)
  return m ? m[1] : null
}

function renderizarOrdemComAlavancagem() {
  const view = render(<OrderForm ticker="POR3" side="BUY" fsBalance={10_000} />)
  // A alavancagem so expoe a estimativa de juros quando ligada.
  fireEvent.click(screen.getByRole('switch', { name: /alavancagem 2x/i }))
  return view
}

describe('Task 20 — juros de alavancagem exibidos', () => {
  test('o rotulo deriva da constante canonica', () => {
    const esperado = `${(LEVERAGE_DAILY_INTEREST_RATE * 100).toFixed(1).replace('.', ',')}%`
    expect(LEVERAGE_DAILY_INTEREST_PERCENT_LABEL).toBe(esperado)
    // Guarda contra o bug original: a taxa operacional LENDA (0,1%) nao e juros.
    expect(LEVERAGE_DAILY_INTEREST_PERCENT_LABEL).not.toBe('0,1%')
  })

  test('as tres superficies exibem o mesmo percentual, igual ao da constante', () => {
    const { container } = renderizarOrdemComAlavancagem()

    // 1. Card de atalho premium (OrderConfirmationShortcuts)
    const card = screen.getByTestId('premium-feature-card-leverage')
    const doCard = extrairPercentualDeJuros(card.textContent)

    // 2. InfoTip do credito da plataforma no OrderForm
    const infoTip = container.querySelector('[aria-label*="juros diários"]')
    expect(infoTip).not.toBeNull()
    const doInfoTip = extrairPercentualDeJuros(infoTip?.getAttribute('aria-label'))

    // 3. Linha de estimativa do LeverageToggle
    const toggleRow = Array.from(container.querySelectorAll('span')).find((el) =>
      el.textContent?.startsWith('Juros diários estimados'),
    )
    expect(toggleRow).toBeTruthy()
    const doToggle = extrairPercentualDeJuros(toggleRow?.textContent)

    expect(doCard).toBe(LEVERAGE_DAILY_INTEREST_PERCENT_LABEL)
    expect(doInfoTip).toBe(LEVERAGE_DAILY_INTEREST_PERCENT_LABEL)
    expect(doToggle).toBe(LEVERAGE_DAILY_INTEREST_PERCENT_LABEL)
    expect(new Set([doCard, doInfoTip, doToggle]).size).toBe(1)
  })

  test('o percentual exibido e o efetivamente cobrado pelo motor', () => {
    // Position.dailyInterestRate e gravado pelo motor com esta mesma taxa; o
    // rotulo e apenas a projecao dela em pt-BR.
    const { container } = renderizarOrdemComAlavancagem()
    const card = screen.getByTestId('premium-feature-card-leverage')
    const exibido = Number(
      (extrairPercentualDeJuros(card.textContent) ?? '').replace('%', '').replace(',', '.'),
    )
    expect(exibido / 100).toBeCloseTo(LEVERAGE_DAILY_INTEREST_RATE, 10)
    expect(container).toBeTruthy()
  })

  test('nenhuma superficie de juros de alavancagem usa literal na fonte', () => {
    const arquivos = [
      'src/components/orders/OrderConfirmationShortcuts.tsx',
      'src/components/orders/OrderForm.tsx',
      'src/components/orders/LeverageToggle.tsx',
    ]
    for (const arquivo of arquivos) {
      const src = fs.readFileSync(path.join(process.cwd(), arquivo), 'utf-8')
      for (const linha of src.split('\n')) {
        if (!/juros/i.test(linha)) continue
        // Percentual literal apos a palavra "juros" e a taxa hardcoded. O "50% do
        // nocional" que aparece antes dela e outro conceito (LTV do credito).
        expect(linha).not.toMatch(/juros[^%\n]*?\d+(?:[.,]\d+)?%/i)
      }
    }
  })

  test('MarketSession.TRADING continua sendo o valor esperado pelo mock', () => {
    // Blindagem do mock: se o enum mudar, o formulario renderiza fechado e o
    // teste acima falharia por motivo errado.
    expect(MarketSession.TRADING).toBe('TRADING')
  })
})
