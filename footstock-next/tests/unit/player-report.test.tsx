/**
 * @jest-environment jsdom
 */
import React from 'react'
import fs from 'fs'
import path from 'path'
import { render, screen, waitFor } from '@testing-library/react'
import { BASE_NAV_ITEMS } from '@/components/shared/desktop-sidebar'
import { MOBILE_NAV_HREFS } from '@/components/shared/bottom-tab-bar'
import { ROUTES } from '@/lib/constants/routes'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutate = jest.fn()
jest.mock('swr', () => ({ mutate: mockMutate }))

const mockUsePlanGuard = jest.fn()
jest.mock('@/hooks/usePlanGuard', () => ({
  usePlanGuard: () => mockUsePlanGuard(),
}))

// Late import so mocks are in place before the module under test loads.
 
let RelatoriosPage: () => React.JSX.Element

beforeAll(() => {
   
  RelatoriosPage = require('@/app/(app)/relatorios/page').default
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

const ASSETS_PAYLOAD = {
  data: [
    { id: 'asset-1', ticker: 'POR3', displayName: 'Porto Alegre FC' },
    { id: 'asset-2', ticker: 'FLA3', displayName: 'Flamengo' },
  ],
}

function tradeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    userId: 'u1',
    orderId: 'o1',
    assetId: 'asset-1',
    financialType: 'TRADE',
    side: 'BUY',
    ticker: 'POR3',
    displayName: 'Porto Alegre FC',
    quantity: 10,
    price: 25.5,
    fee: 2.55,
    grossAmount: 255,
    totalAmount: 257.55,
    cashDelta: -257.55,
    createdAt: '2026-08-13T12:00:00.000Z',
    executedAt: '2026-08-13T11:59:50.000Z',
    orderType: 'MARKET',
    timestampSource: 'ORDER_EXECUTED_AT',
    realizedPnl: null,
    pnlProvenance: 'UNAVAILABLE',
    ...overrides,
  }
}

let txPayload: Record<string, unknown> = {}
let txFails = false
let exportStatus = 200

function setTransactions(
  data: unknown[],
  pagination: Record<string, unknown> = {},
) {
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
    .map((c) => String(c[0]))
    .filter((u) => u.includes('/api/v1/transactions') && !u.includes('/export'))
}

function planJOGADOR() {
  return {
    plan: 'JOGADOR' as const,
    isLoading: false,
    isError: false,
    isReady: true,
    hasAccess: (tier: string) => tier === 'JOGADOR',
  }
}

function planCRAQUE() {
  return {
    plan: 'CRAQUE' as const,
    isLoading: false,
    isError: false,
    isReady: true,
    hasAccess: (tier: string) =>
      tier === 'JOGADOR' || tier === 'CRAQUE',
  }
}

function planLoading() {
  return {
    plan: 'JOGADOR' as const,
    isLoading: true,
    isError: false,
    isReady: false,
    hasAccess: () => false,
  }
}

function planError() {
  return {
    plan: 'JOGADOR' as const,
    isLoading: false,
    isError: true,
    isReady: false,
    hasAccess: () => false,
  }
}

async function renderPage() {
  const view = render(<RelatoriosPage />)
  await waitFor(() => expect(txCalls().length).toBeGreaterThan(0))
  return view
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks()
  txFails = false
  exportStatus = 200
  setTransactions([tradeTx()])
  mockUsePlanGuard.mockReturnValue(planCRAQUE())

  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes('/api/v1/assets')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ASSETS_PAYLOAD,
      })
    }
    if (String(url).includes('/api/v1/transactions/export')) {
      if (exportStatus === 403) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({
            error: {
              code: 'PLAN-001',
              message:
                'Exportação de dados disponível a partir do plano Craque.',
              feature: 'export_data',
              minPlan: 'CRAQUE',
            },
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: async () => new Blob(['csv'], { type: 'text/csv' }),
      })
    }
    if (txFails) {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: 'SYS-001', message: 'Erro interno.' },
        }),
      })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => txPayload,
    })
  })

  // URL.createObjectURL / revokeObjectURL are not in jsdom
  global.URL.createObjectURL = jest.fn(() => 'blob:mock')
  global.URL.revokeObjectURL = jest.fn()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RelatoriosPage — Task 18', () => {
  // ---- Criterion 1: renders for JOGADOR without gate ----
  test('renderiza para JOGADOR sem gate de plano', async () => {
    mockUsePlanGuard.mockReturnValue(planJOGADOR())
    await renderPage()
    expect(screen.getByTestId('player-report-page')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByTestId('player-report-table')).toBeTruthy(),
    )
  })

  // ---- Criterion 2: 7 data-testids ----
  test('export button mostra loading quando isReady e falso', async () => {
    mockUsePlanGuard.mockReturnValue(planLoading())
    render(<RelatoriosPage />)
    expect(screen.getByTestId('player-report-export-loading')).toBeTruthy()
    await waitFor(() => expect(txCalls().length).toBeGreaterThan(0))
  })

  test('export button mostra erro quando isError e verdadeiro', async () => {
    mockUsePlanGuard.mockReturnValue(planError())
    await renderPage()
    expect(screen.getByTestId('player-report-export-error')).toBeTruthy()
  })

  test('export button mostra bloqueio quando plano pronto sem acesso', async () => {
    mockUsePlanGuard.mockReturnValue(planJOGADOR())
    await renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('player-report-export-locked')).toBeTruthy(),
    )
  })

  test('export button disponivel quando plano pronto com acesso', async () => {
    mockUsePlanGuard.mockReturnValue(planCRAQUE())
    await renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('player-report-export')).toBeTruthy(),
    )
  })

  test('ao receber 403 na exportacao, exibe feedback visivel com mensagem do corpo', async () => {
    exportStatus = 403
    mockUsePlanGuard.mockReturnValue(planCRAQUE())
    await renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('player-report-export')).toBeTruthy(),
    )

    const { fireEvent } = require('@testing-library/react')
    fireEvent.click(screen.getByTestId('player-report-export'))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeTruthy()
      expect(alert.textContent).toContain(
        'Exportação de dados disponível a partir do plano Craque.',
      )
    })

    expect(mockMutate).toHaveBeenCalledWith('plan-guard')
  })

  // ---- Criterion 3: navigation ----
  test('/relatorios registrada em routes, desktop e mobile', () => {
    expect(ROUTES.RELATORIOS).toBe('/relatorios')
    expect(BASE_NAV_ITEMS.map((i) => i.href)).toContain('/relatorios')
    expect(MOBILE_NAV_HREFS).toContain('/relatorios')
  })

  // ---- Criterion 4: reuses TransactionFilters ----
  test('reutiliza TransactionFilters sem duplicar controles', async () => {
    await renderPage()
    expect(screen.getByTestId('transaction-filters')).toBeTruthy()
    expect(screen.getByTestId('transaction-filter-type')).toBeTruthy()
    expect(screen.queryByTestId('transaction-filter-financial-type')).toBeNull()
    expect(screen.getByTestId('transaction-filter-asset')).toBeTruthy()
    expect(screen.getByTestId('transaction-filter-from')).toBeTruthy()
    expect(screen.getByTestId('transaction-filter-to')).toBeTruthy()
    expect(
      (screen.getByTestId('transaction-filter-clear') as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  // ---- Criterion 5: only TRADE ----
  test('somente TRADE na tabela — FEE e excluido', async () => {
    const feeTx = tradeTx({
      id: 'tx-fee',
      financialType: 'FEE',
      side: null,
      ticker: 'POR3',
      quantity: null,
      price: null,
      fee: 5,
      grossAmount: null,
      totalAmount: 5,
      realizedPnl: null,
      pnlProvenance: 'UNAVAILABLE',
    })
    setTransactions([tradeTx({ id: 'tx-1' }), feeTx, tradeTx({ id: 'tx-2' })])
    await renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('player-report-table')).toBeTruthy(),
    )

    const rows = screen
      .getByTestId('player-report-table')
      .querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)

    // FEE ticker should not appear in the table
    const tableText = screen.getByTestId('player-report-table').textContent
    expect(tableText).not.toContain('tx-fee')
  })

  // ---- Criterion 6: blocked never shows when isReady is false ----
  test('bloqueio de JOGADOR nunca aparece com isReady falso', async () => {
    mockUsePlanGuard.mockReturnValue(planLoading())
    render(<RelatoriosPage />)
    expect(screen.queryByTestId('player-report-export-locked')).toBeNull()
    expect(screen.getByTestId('player-report-export-loading')).toBeTruthy()
    await waitFor(() => expect(txCalls().length).toBeGreaterThan(0))
  })

  // ---- Criterion 7: max 200 + truncation ----
  test('com total maior que 200 o aviso de truncamento aparece e a tabela tem no maximo 200 linhas', async () => {
    // Cenario realista: a API honra limit=200 e devolve pagination.total=201
    const records = Array.from({ length: 200 }, (_, i) =>
      tradeTx({ id: `tx-${i}`, ticker: `T${i}` }),
    )
    setTransactions(records, { total: 201 })
    await renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('player-report-truncation')).toBeTruthy(),
    )
    expect(screen.getByTestId('player-report-truncation').textContent).toContain(
      '200',
    )
    expect(screen.getByTestId('player-report-truncation').textContent).toContain(
      '10.000',
    )
    expect(screen.getByTestId('player-report-truncation').textContent).toContain(
      '366',
    )

    await waitFor(() =>
      expect(screen.getByTestId('player-report-table')).toBeTruthy(),
    )
    const rows = screen
      .getByTestId('player-report-table')
      .querySelectorAll('tbody tr')
    expect(rows.length).toBeLessThanOrEqual(200)
  })

  test('com 200 ou menos registros nao ha aviso de truncamento', async () => {
    const records = Array.from({ length: 200 }, (_, i) =>
      tradeTx({ id: `tx-${i}` }),
    )
    setTransactions(records, { total: 200 })
    await renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('player-report-table')).toBeTruthy(),
    )
    expect(screen.queryByTestId('player-report-truncation')).toBeNull()
  })

  // ---- Criterion 8: 9 column headers ----
  test('cabecalho da tabela tem 9 colunas', async () => {
    await renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('player-report-table')).toBeTruthy(),
    )
    const headers = screen
      .getByTestId('player-report-table')
      .querySelectorAll('thead th')
    expect(headers.length).toBe(9)
  })

  // ---- Criterion 9: empty filtered vs empty account ----
  test('vazio de conta sem filtros ativos', async () => {
    setTransactions([])
    await renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('player-report-empty')).toBeTruthy(),
    )
    expect(
      screen.getByTestId('player-report-empty').textContent,
    ).toContain('Nenhuma negociação registrada')
  })

  test('vazio de filtro com filtro ativo', async () => {
    setTransactions([])
    await renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('player-report-empty')).toBeTruthy(),
    )

    // Activate a filter
    const typeSelect = screen.getByTestId('transaction-filter-type')
    const { fireEvent } = require('@testing-library/react')
    fireEvent.change(typeSelect, { target: { value: 'LIMIT' } })

    await waitFor(() =>
      expect(screen.getByTestId('player-report-empty')).toBeTruthy(),
    )
    expect(
      screen.getByTestId('player-report-empty').textContent,
    ).toContain('Nenhuma negociação no filtro atual')
  })

  // ---- Criterion 10: no hex/rgba literals — contract: tokens only ----
  test('nenhum literal hex/rgba no arquivo da pagina', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/app/(app)/relatorios/page.tsx',
      ),
      'utf-8',
    )

    const hexMatches = source.match(/#[0-9A-Fa-f]{6}\b/g) ?? []
    expect(hexMatches).toEqual([])

    const rgbaMatches = source.match(/rgba\(/g) ?? []
    expect(rgbaMatches).toEqual([])
  })

  // ---- Criterion 11: request sends financialType=TRADE ----
  test('requisicao inclui financialType=TRADE', async () => {
    await renderPage()
    const lastCall = txCalls()[txCalls().length - 1] ?? ''
    expect(lastCall).toContain('financialType=TRADE')
  })

  // ---- Error + retry ----
  test('erro de carregamento exibe botao de retry', async () => {
    txFails = true
    await renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('player-report-error')).toBeTruthy(),
    )
    expect(screen.getByTestId('player-report-retry')).toBeTruthy()
  })

  // ---- Realized PnL display ----
  test('resultado realizado PERSISTED exibe valor formatado', async () => {
    setTransactions([
      tradeTx({
        id: 'tx-pnl',
        realizedPnl: 42.5,
        pnlProvenance: 'PERSISTED',
        side: 'SELL',
      }),
    ])
    await renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('player-report-table')).toBeTruthy(),
    )
    const tableText = screen.getByTestId('player-report-table').textContent
    expect(tableText).toContain('+')
    expect(tableText).toContain('42,50')
  })

  test('resultado realizado UNAVAILABLE exibe texto Indisponivel', async () => {
    setTransactions([
      tradeTx({ realizedPnl: null, pnlProvenance: 'UNAVAILABLE' }),
    ])
    await renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('player-report-table')).toBeTruthy(),
    )
    const tableText = screen.getByTestId('player-report-table').textContent
    expect(tableText).toContain('Indisponível')
  })
})
