/**
 * @jest-environment jsdom
 */
import React from 'react'
import fs from 'fs'
import path from 'path'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { TransactionHistory } from '@/components/portfolio/TransactionHistory'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

const ASSETS_PAYLOAD = {
  data: [
    { id: 'asset-1', ticker: 'POR3', displayName: 'Porto Alegre FC' },
    { id: 'asset-2', ticker: 'FLA3', displayName: 'Flamengo' },
  ],
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    financialType: 'TRADE',
    side: 'BUY',
    ticker: 'POR3',
    displayName: 'Porto Alegre FC',
    quantity: 10,
    price: 25.5,
    fee: 2.55,
    grossAmount: 255,
    cashDelta: -257.55,
    totalAmount: 257.55,
    createdAt: '2026-08-13T12:00:00.000Z',
    ...overrides,
  }
}

let txPayload: Record<string, unknown> = {}
let txFails = false

function setTransactions(data: unknown[], pagination: Record<string, unknown> = {}) {
  txPayload = {
    data,
    pagination: {
      page: 1,
      total: data.length,
      totalPages: 1,
      hasNext: false,
      ...pagination,
    },
  }
}

function txCalls(): string[] {
  return mockFetch.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('/api/v1/transactions'))
}

function lastTxCall(): string {
  const calls = txCalls()
  return calls[calls.length - 1] ?? ''
}

beforeEach(() => {
  jest.clearAllMocks()
  txFails = false
  setTransactions([transaction()])

  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes('/api/v1/assets')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ASSETS_PAYLOAD })
    }
    if (txFails) {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'SYS-001', message: 'Erro interno.' } }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => txPayload })
  })
})

async function renderHistory() {
  const view = render(<TransactionHistory />)
  await waitFor(() => expect(txCalls().length).toBeGreaterThan(0))
  return view
}

describe('TransactionHistory + TransactionFilters', () => {
  test('renderiza todos os controles de filtro com os data-testid canonicos', async () => {
    await renderHistory()

    expect(screen.getByTestId('transaction-filter-type')).toBeTruthy()
    expect(screen.getByTestId('transaction-filter-financial-type')).toBeTruthy()
    expect(screen.getByTestId('transaction-filter-asset')).toBeTruthy()
    expect(screen.getByTestId('transaction-filter-from')).toBeTruthy()
    expect(screen.getByTestId('transaction-filter-to')).toBeTruthy()
    expect(screen.getByTestId('transaction-filter-clear')).toBeTruthy()
  })

  test('preserva os data-testid de estado do extrato', async () => {
    // loading aparece antes da primeira resposta
    render(<TransactionHistory />)
    expect(screen.getByTestId('transaction-history-loading')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('transaction-history-success')).toBeTruthy())

  })

  test('exibe erro com botao de nova tentativa', async () => {
    txFails = true
    await renderHistory()

    await waitFor(() => expect(screen.getByTestId('transaction-history-error')).toBeTruthy())
    expect(screen.getByTestId('transaction-history-retry')).toBeTruthy()
    // Filtros continuam na tela no estado de erro, senao o usuario nao consegue sair dele.
    expect(screen.getByTestId('transaction-filter-clear')).toBeTruthy()
  })

  test('expoe paginacao acessivel quando ha mais de uma pagina', async () => {
    setTransactions([transaction()], { totalPages: 3, hasNext: true })
    await renderHistory()

    await waitFor(() => expect(screen.getByTestId('transaction-history-success')).toBeTruthy())
    expect(screen.getByTestId('transaction-history-prev').getAttribute('aria-label')).toBe('Página anterior')
    expect(screen.getByTestId('transaction-history-next').getAttribute('aria-label')).toBe('Próxima página')
  })

  test('trocar filtro volta a listagem para a pagina 1', async () => {
    setTransactions([transaction()], { totalPages: 3, hasNext: true })
    await renderHistory()
    await waitFor(() => expect(screen.getByTestId('transaction-history-success')).toBeTruthy())

    fireEvent.click(screen.getByTestId('transaction-history-next'))
    await waitFor(() => expect(lastTxCall()).toContain('page=2'))

    fireEvent.change(screen.getByTestId('transaction-filter-financial-type'), {
      target: { value: 'BONUS' },
    })

    await waitFor(() => expect(lastTxCall()).toContain('financialType=BONUS'))
    expect(lastTxCall()).toContain('page=1')
    expect(lastTxCall()).not.toContain('page=2')
  })

  test('navegar de pagina preserva os filtros ativos', async () => {
    setTransactions([transaction()], { totalPages: 3, hasNext: true })
    await renderHistory()
    await waitFor(() => expect(screen.getByTestId('transaction-history-success')).toBeTruthy())

    fireEvent.change(screen.getByTestId('transaction-filter-type'), { target: { value: 'LIMIT' } })
    await waitFor(() => expect(lastTxCall()).toContain('type=LIMIT'))
    await waitFor(() => expect(screen.getByTestId('transaction-history-next')).toBeTruthy())

    fireEvent.click(screen.getByTestId('transaction-history-next'))

    await waitFor(() => expect(lastTxCall()).toContain('page=2'))
    expect(lastTxCall()).toContain('type=LIMIT')
  })

  test('filtro sem resultado exibe estado vazio proprio, distinto do vazio de conta', async () => {
    setTransactions([])
    await renderHistory()

    // Conta sem movimentacao
    await waitFor(() => expect(screen.getByTestId('transaction-history-empty')).toBeTruthy())
    expect(screen.getByTestId('transaction-history-empty-account')).toBeTruthy()
    expect(screen.queryByTestId('transaction-history-empty-filtered')).toBeNull()

    // Mesmo resultado vazio, agora com filtro ativo
    fireEvent.change(screen.getByTestId('transaction-filter-financial-type'), {
      target: { value: 'BONUS' },
    })

    await waitFor(() => expect(screen.getByTestId('transaction-history-empty-filtered')).toBeTruthy())
    expect(screen.queryByTestId('transaction-history-empty-account')).toBeNull()
    // Nunca tela em branco: o wrapper canonico continua presente.
    expect(screen.getByTestId('transaction-history-empty')).toBeTruthy()

    // O estado vazio filtrado oferece a saida.
    const filtered = screen.getByTestId('transaction-history-empty-filtered')
    fireEvent.click(within(filtered).getByRole('button', { name: 'Limpar filtros' }))

    await waitFor(() => expect(screen.getByTestId('transaction-history-empty-account')).toBeTruthy())
    expect((screen.getByTestId('transaction-filter-financial-type') as HTMLSelectElement).value).toBe('')
  })

  test('o filtro de ativo mostra ticker e nome e nunca o assetId', async () => {
    const { container } = await renderHistory()
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3))

    const assetSelect = screen.getByTestId('transaction-filter-asset')
    expect(assetSelect.textContent).toContain('POR3 - Porto Alegre FC')
    expect(assetSelect.textContent).toContain('FLA3 - Flamengo')
    // O identificador interno nao e texto de tela.
    expect(container.textContent).not.toContain('asset-1')
    expect(container.textContent).not.toContain('asset-2')

    fireEvent.change(assetSelect, { target: { value: 'asset-1' } })
    await waitFor(() => expect(lastTxCall()).toContain('assetId=asset-1'))
  })

  test('escolher o mesmo dia em de e ate envia o dia seguinte como limite exclusivo', async () => {
    await renderHistory()

    fireEvent.change(screen.getByTestId('transaction-filter-from'), {
      target: { value: '2026-08-13' },
    })
    fireEvent.change(screen.getByTestId('transaction-filter-to'), {
      target: { value: '2026-08-13' },
    })

    await waitFor(() => expect(lastTxCall()).toContain('to=2026-08-14'))
    expect(lastTxCall()).toContain('from=2026-08-13')
    expect(screen.queryByTestId('transaction-filter-error')).toBeNull()
  })

  test('intervalo invertido exibe erro inline, preserva os valores e nao dispara request', async () => {
    await renderHistory()

    fireEvent.change(screen.getByTestId('transaction-filter-from'), {
      target: { value: '2026-08-20' },
    })
    await waitFor(() => expect(lastTxCall()).toContain('from=2026-08-20'))
    const callsBefore = txCalls().length

    fireEvent.change(screen.getByTestId('transaction-filter-to'), {
      target: { value: '2026-08-10' },
    })

    await waitFor(() => expect(screen.getByTestId('transaction-filter-error')).toBeTruthy())
    expect(screen.getByTestId('transaction-filter-error').textContent).toContain(
      'A data inicial deve ser anterior ou igual à data final.'
    )
    expect(txCalls().length).toBe(callsBefore)
    // Valores digitados preservados.
    expect((screen.getByTestId('transaction-filter-from') as HTMLInputElement).value).toBe('2026-08-20')
    expect((screen.getByTestId('transaction-filter-to') as HTMLInputElement).value).toBe('2026-08-10')
  })

  test('TransactionFilters nao importa nada de TransactionHistory', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/portfolio/TransactionFilters.tsx'),
      'utf-8'
    )
    expect(source).not.toMatch(/TransactionHistory/)
  })

  test('falha ao carregar ativos expoe retry sem derrubar o extrato', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes('/api/v1/assets')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => txPayload })
    })

    await renderHistory()
    await waitFor(() => expect(screen.getByTestId('transaction-history-success')).toBeTruthy())
    expect(screen.getByTestId('transaction-filter-asset-error')).toBeTruthy()
    expect(screen.getByTestId('transaction-filter-asset-retry')).toBeTruthy()
  })
})
