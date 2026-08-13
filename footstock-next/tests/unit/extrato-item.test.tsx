/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { ExtratoItem, type ExtratoTransaction } from '@/components/extrato/ExtratoItem'

function tx(overrides: Partial<ExtratoTransaction> = {}): ExtratoTransaction {
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
})
