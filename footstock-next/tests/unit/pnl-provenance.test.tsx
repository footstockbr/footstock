/** @jest-environment jsdom */
// ============================================================================
// FootStock — Proveniencia do resultado realizado (Task 15)
// Criterios:
//   1. Nenhum valor sem snapshot aparece como PERSISTED.
//   2. Transacao com snapshot exibe o realizedPnl numerico.
//   3. Transacao legada sem snapshot exibe texto pt-BR (UNAVAILABLE traduzido).
//   4. Nota "taxas contabilizadas em separado" presente.
//   5. (grep) 'RECONSTRUCTED' so aparece na declaracao do tipo.
//   6. Rotulo declara "bruto de taxas".
//   7. Strings tecnicas PERSISTED/RECONSTRUCTED/UNAVAILABLE nunca no DOM.
// ============================================================================

import React from 'react'
import { render, screen } from '@testing-library/react'
import { ExtratoItem, type ExtratoItemTransaction } from '@/components/extrato/ExtratoItem'
import {
  resolvePnlProvenance,
  pnlProvenanceLabel,
} from '@/lib/contracts/transaction-contract'
import type { PnlProvenance } from '@/lib/contracts/transaction-contract'

// ── ExtratoItem: proveniencia no drill-down ─────────────────────────────────

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function tx(overrides: Partial<ExtratoItemTransaction> = {}): ExtratoItemTransaction {
  return {
    id: 'tx-prov-1',
    financialType: 'TRADE',
    totalAmount: 300,
    createdAt: '2026-08-25T12:00:00.000Z',
    side: 'SELL',
    ticker: 'POR3',
    displayName: 'Porto Alegre FC',
    quantity: 10,
    price: 30,
    fee: 1.5,
    grossAmount: 300,
    cashDelta: 298.5,
    ...overrides,
  }
}

describe('ExtratoItem — proveniencia do resultado realizado', () => {
  test('transacao com snapshot exibe realizedPnl numerico (criterio 2)', () => {
    render(
      <ExtratoItem
        transaction={tx({
          realizedPnl: 47.5,
          pnlProvenance: 'PERSISTED',
        })}
        mode="expandable"
        defaultExpanded
      />,
    )
    const el = screen.getByTestId('extrato-realized-pnl')
    expect(el.textContent).toMatch(/47[,.]50/)
  })

  test('transacao legada sem snapshot exibe texto pt-BR, nunca numero (criterio 3)', () => {
    render(
      <ExtratoItem
        transaction={tx({
          realizedPnl: undefined,
          pnlProvenance: 'UNAVAILABLE',
        })}
        mode="expandable"
        defaultExpanded
      />,
    )
    const el = screen.getByTestId('extrato-realized-pnl')
    expect(el.textContent).toContain('indispon')
    expect(el.textContent).not.toMatch(/FS\$/)
  })

  test('rotulo declara bruto de taxas (criterio 6)', () => {
    render(
      <ExtratoItem
        transaction={tx({ realizedPnl: 10, pnlProvenance: 'PERSISTED' })}
        mode="expandable"
        defaultExpanded
      />,
    )
    expect(screen.getByTestId('extrato-realized-pnl').textContent).toBeTruthy()
    // O rotulo "bruto de taxas" aparece no label do DetailRow e na nota
    expect(screen.getAllByText(/bruto de taxas/i).length).toBeGreaterThanOrEqual(1)
  })

  test('nota "taxas contabilizadas em separado" presente (criterio 4)', () => {
    render(
      <ExtratoItem
        transaction={tx({ realizedPnl: 10, pnlProvenance: 'PERSISTED' })}
        mode="expandable"
        defaultExpanded
      />,
    )
    expect(screen.getByText(/taxas s.o contabilizadas em separado/i)).toBeTruthy()
  })

  test('strings tecnicas nunca aparecem no DOM (criterio 7)', () => {
    const { container } = render(
      <>
        <ExtratoItem
          transaction={tx({ realizedPnl: 10, pnlProvenance: 'PERSISTED' })}
          mode="expandable"
          defaultExpanded
        />
        <ExtratoItem
          transaction={tx({ id: 'tx-2', pnlProvenance: 'UNAVAILABLE' })}
          mode="expandable"
          defaultExpanded
        />
      </>,
    )
    const text = container.textContent ?? ''
    expect(text).not.toContain('PERSISTED')
    expect(text).not.toContain('RECONSTRUCTED')
    expect(text).not.toContain('UNAVAILABLE')
  })
})

// ── Contrato: resolvePnlProvenance ───────────────────────────────────────────

describe('resolvePnlProvenance', () => {
  test('realizedPnl nao nulo retorna PERSISTED', () => {
    expect(resolvePnlProvenance(42.5)).toBe('PERSISTED')
    expect(resolvePnlProvenance(0)).toBe('PERSISTED')
    expect(resolvePnlProvenance(-10)).toBe('PERSISTED')
  })

  test('realizedPnl nulo retorna UNAVAILABLE (criterio 1)', () => {
    expect(resolvePnlProvenance(null)).toBe('UNAVAILABLE')
  })
})

// ── Contrato: pnlProvenanceLabel ─────────────────────────────────────────────

describe('pnlProvenanceLabel', () => {
  test('traduz cada valor do enum para pt-BR', () => {
    const labels: Record<PnlProvenance, string> = {
      PERSISTED: pnlProvenanceLabel('PERSISTED'),
      RECONSTRUCTED: pnlProvenanceLabel('RECONSTRUCTED'),
      UNAVAILABLE: pnlProvenanceLabel('UNAVAILABLE'),
    }
    // Nenhum rotulo e o nome do enum tecnico
    for (const [key, label] of Object.entries(labels)) {
      expect(label).not.toBe(key)
    }
    // UNAVAILABLE menciona indisponibilidade
    expect(labels.UNAVAILABLE).toMatch(/indispon/i)
  })
})
