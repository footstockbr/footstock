/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExtratoItem, type ExtratoItemTransaction } from '@/components/extrato/ExtratoItem'

// O drill-down se alimenta apenas do payload da listagem. Qualquer fetch aqui e
// regressao.
const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

beforeEach(() => {
  jest.clearAllMocks()
})

function tx(overrides: Partial<ExtratoItemTransaction> = {}): ExtratoItemTransaction {
  return {
    id: 'tx-1',
    financialType: 'TRADE',
    totalAmount: 257.55,
    createdAt: '2026-08-13T12:00:00.000Z',
    ...overrides,
  }
}

describe('ExtratoItem', () => {
  test('exibe ticker, nome, quantidade, preco unitario, subtotal, taxa e total debitado na compra', () => {
    render(
      <ExtratoItem
        transaction={tx({
          financialType: 'TRADE',
          side: 'BUY',
          ticker: 'POR3',
          displayName: 'Porto Alegre FC',
          quantity: 10,
          price: 25.5,
          fee: 2.55,
          grossAmount: 255,
          cashDelta: -257.55,
          orderType: 'MARKET',
          executedAt: '2026-08-13T11:59:50.000Z',
          timestampSource: 'ORDER_EXECUTED_AT',
        })}
      />
    )

    expect(screen.getByTestId('extrato-asset-ticker').textContent).toContain('POR3')
    expect(screen.getByTestId('extrato-asset-ticker').textContent).toContain('Porto Alegre FC')
    expect(screen.getByTestId('extrato-executed-at').textContent).toBeTruthy()
    expect(screen.getByTestId('extrato-quantity').textContent).toContain('10')
    expect(screen.getByTestId('extrato-unit-price').textContent).toMatch(/25[,.]50/)
    expect(screen.getByTestId('extrato-gross-amount').textContent).toMatch(/255[,.]00/)
    expect(screen.getByTestId('extrato-fee-amount').textContent).toMatch(/2[,.]55/)
    expect(screen.getByTestId('extrato-cash-delta').textContent).toMatch(/-.*?257[,.]55/)
  })

  test('exibe venda como credito', () => {
    render(
      <ExtratoItem
        transaction={tx({
          financialType: 'TRADE',
          side: 'SELL',
          ticker: 'POR3',
          quantity: 5,
          price: 30,
          fee: 1.5,
          grossAmount: 150,
          cashDelta: 148.5,
        })}
      />
    )

    expect(screen.getByTestId('extrato-cash-delta').textContent).toMatch(/\+.*?148[,.]50/)
  })

  test('nao quebra com ativo nulo, ordem nula ou valores ausentes', () => {
    render(
      <ExtratoItem
        transaction={tx({
          financialType: 'BONUS',
          ticker: null,
          displayName: null,
          quantity: null,
          price: null,
          fee: null,
          grossAmount: null,
          cashDelta: 50,
          orderType: null,
          executedAt: undefined,
          timestampSource: 'TRANSACTION_CREATED_AT',
        })}
      />
    )

    expect(screen.getByTestId('extrato-bonus-item')).toBeTruthy()
    expect(screen.getByTestId('extrato-cash-delta').textContent).toMatch(/\+.*?50[,.]00/)
  })

  test('rotula FEE separada sem duplicar debito', () => {
    render(
      <ExtratoItem
        transaction={tx({
          financialType: 'FEE',
          cashDelta: -2.55,
          fee: 2.55,
        })}
      />
    )

    expect(screen.getByTestId('extrato-fee-item')).toBeTruthy()
    expect(screen.getByText(/Taxa ja incluida no total/i)).toBeTruthy()
    expect(screen.getByTestId('extrato-cash-delta').textContent).toMatch(/-.*?2[,.]55/)
  })

  // ---------------------------------------------------------------------------
  // Drill-down (Task 11)
  // ---------------------------------------------------------------------------

  const detalhada = () =>
    tx({
      id: 'tx-77',
      financialType: 'TRADE',
      side: 'BUY',
      orderId: 'order-77',
      assetId: 'asset-77',
      ticker: 'POR3',
      displayName: 'Porto Alegre FC',
      quantity: 10,
      price: 25.5,
      fee: 2.55,
      grossAmount: 255,
      cashDelta: -257.55,
      fsAmount: -257.55,
      balanceBefore: 1000,
      balanceAfter: 742.45,
      orderType: 'MARKET',
      executedAt: '2026-08-13T11:59:50.000Z',
      timestampSource: 'ORDER_EXECUTED_AT',
    })

  test('modo summary nao oferece drill-down', () => {
    render(<ExtratoItem transaction={detalhada()} />)

    expect(screen.queryByTestId('extrato-expand-tx-77')).toBeNull()
    expect(screen.queryByTestId('extrato-details-tx-77')).toBeNull()
  })

  test('expande e recolhe o drill-down sem chamada extra de API', () => {
    render(<ExtratoItem transaction={detalhada()} mode="expandable" />)

    const toggle = screen.getByTestId('extrato-expand-tx-77')
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe('extrato-details-tx-77')
    expect(screen.queryByTestId('extrato-details-tx-77')).toBeNull()

    fireEvent.click(toggle)

    const details = screen.getByTestId('extrato-details-tx-77')
    expect(details.getAttribute('id')).toBe('extrato-details-tx-77')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    // O resumo da linha continua visivel com o drill-down aberto.
    expect(screen.getByTestId('extrato-asset-ticker').textContent).toContain('POR3')

    fireEvent.click(toggle)
    expect(screen.queryByTestId('extrato-details-tx-77')).toBeNull()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('o toggle e operavel por teclado', () => {
    render(<ExtratoItem transaction={detalhada()} mode="expandable" />)

    const toggle = screen.getByTestId('extrato-expand-tx-77')
    toggle.focus()
    expect(document.activeElement).toBe(toggle)

    // button nativo: Enter e Space disparam click sem handler de tecla proprio.
    fireEvent.click(toggle)
    expect(screen.getByTestId('extrato-details-tx-77')).toBeTruthy()
  })

  test('defaultExpanded abre o drill-down no primeiro render', () => {
    render(<ExtratoItem transaction={detalhada()} mode="expandable" defaultExpanded />)

    expect(screen.getByTestId('extrato-details-tx-77')).toBeTruthy()
    expect(screen.getByTestId('extrato-expand-tx-77').getAttribute('aria-expanded')).toBe('true')
  })

  test('o drill-down expoe os campos tecnicos ja presentes no payload', () => {
    render(<ExtratoItem transaction={detalhada()} mode="expandable" defaultExpanded />)

    expect(screen.getByTestId('extrato-transaction-id').textContent).toBe('tx-77')
    expect(screen.getByTestId('extrato-order-id').textContent).toBe('order-77')
    expect(screen.getByTestId('extrato-asset-id').textContent).toBe('asset-77')
    expect(screen.getByTestId('extrato-financial-type').textContent).toBe('Negociação')
    expect(screen.getByTestId('extrato-order-type').textContent).toBe('Mercado')
    expect(screen.getByTestId('extrato-balance-before').textContent).toMatch(/1[.,]000[,.]00/)
    expect(screen.getByTestId('extrato-balance-after').textContent).toMatch(/742[,.]45/)
    expect(screen.getByTestId('extrato-fs-amount').textContent).toMatch(/-.*?257[,.]55/)
    expect(screen.getByTestId('extrato-cash-delta-detail').textContent).toMatch(/-.*?257[,.]55/)
  })

  test('traduz a origem da data e nunca mostra o enum tecnico', () => {
    const { container } = render(
      <ExtratoItem transaction={detalhada()} mode="expandable" defaultExpanded />
    )

    expect(screen.getByTestId('extrato-timestamp-source').textContent).toBe('Execução da ordem')
    expect(container.textContent).not.toContain('ORDER_EXECUTED_AT')
    expect(container.textContent).not.toContain('TRANSACTION_CREATED_AT')
  })

  test('a taxa nao entra duas vezes no liquido exibido', () => {
    render(<ExtratoItem transaction={detalhada()} mode="expandable" defaultExpanded />)

    // Bruto 255,00 + taxa 2,55 = 257,55 debitado. 260,10 seria a taxa contada duas vezes.
    expect(screen.getByTestId('extrato-fee-amount').textContent).toMatch(/2[,.]55/)
    expect(screen.getByTestId('extrato-cash-delta').textContent).toMatch(/-.*?257[,.]55/)
    expect(screen.getByTestId('extrato-cash-delta-detail').textContent).not.toContain('260')
    expect(screen.getByTestId('extrato-fs-amount').textContent).not.toContain('260')
  })

  test('transacao legada sem campos exibe indisponivel, nunca zero fabricado', () => {
    render(
      <ExtratoItem
        transaction={tx({
          id: 'tx-legado',
          financialType: 'TRADE',
          side: 'SELL',
          quantity: 5,
        })}
        mode="expandable"
        defaultExpanded
      />
    )

    expect(screen.getByTestId('extrato-order-id').textContent).toBe('Indisponível')
    expect(screen.getByTestId('extrato-asset-id').textContent).toBe('Indisponível')
    expect(screen.getByTestId('extrato-order-type').textContent).toBe('Indisponível')
    expect(screen.getByTestId('extrato-timestamp-source').textContent).toBe('Indisponível')
    expect(screen.getByTestId('extrato-balance-before').textContent).toBe('Indisponível')
    expect(screen.getByTestId('extrato-balance-after').textContent).toBe('Indisponível')
    expect(screen.getByTestId('extrato-fs-amount').textContent).toBe('Indisponível')
    expect(screen.getByTestId('extrato-cash-delta-detail').textContent).toBe('Indisponível')
    // Zero fabricado seria "FS$ 0,00".
    expect(screen.getByTestId('extrato-balance-before').textContent).not.toContain('0,00')
    expect(screen.getByTestId('extrato-unit-price').textContent).toContain('Indisponível')
  })
})
