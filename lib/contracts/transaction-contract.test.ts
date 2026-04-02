// ============================================================================
// Foot Stock — Testes: transaction-contract
// Rastreabilidade: INT-011, INT-018 / TASK-0/ST003
// ============================================================================

import {
  verifyBalanceConsistency,
  verifyNonNegativeBalance,
  verifyMarginConsistency,
  auditTransactionIntegrity,
  type TransactionRecord,
} from './transaction-contract'

function makeTx(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: 'tx-001',
    userId: 'user-1',
    balanceBefore: 1000,
    balanceAfter: 900,
    fsAmount: -100,
    ...overrides,
  }
}

describe('verifyBalanceConsistency', () => {
  it('retorna true quando balanceAfter === balanceBefore + fsAmount', () => {
    expect(verifyBalanceConsistency(makeTx({ balanceBefore: 1000, fsAmount: -100, balanceAfter: 900 }))).toBe(true)
  })

  it('retorna false quando balanceAfter difere do esperado', () => {
    expect(verifyBalanceConsistency(makeTx({ balanceBefore: 1000, fsAmount: -100, balanceAfter: 850 }))).toBe(false)
  })

  it('retorna true para transação legada (campos null)', () => {
    expect(verifyBalanceConsistency(makeTx({ balanceBefore: null, balanceAfter: null, fsAmount: null }))).toBe(true)
  })
})

describe('verifyNonNegativeBalance', () => {
  it('retorna true para saldo positivo', () => {
    expect(verifyNonNegativeBalance(100)).toBe(true)
  })

  it('retorna true para saldo zero', () => {
    expect(verifyNonNegativeBalance(0)).toBe(true)
  })

  it('retorna false para saldo negativo', () => {
    expect(verifyNonNegativeBalance(-1)).toBe(false)
  })
})

describe('verifyMarginConsistency', () => {
  it('retorna true para margem e saldo positivos', () => {
    expect(verifyMarginConsistency(500, 1000)).toBe(true)
  })

  it('retorna false para margem negativa', () => {
    expect(verifyMarginConsistency(-100, 1000)).toBe(false)
  })

  it('retorna false para saldo negativo', () => {
    expect(verifyMarginConsistency(0, -50)).toBe(false)
  })
})

describe('auditTransactionIntegrity', () => {
  const makeChain = (count: number, startBalance = 10000, delta = -100): TransactionRecord[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `tx-${i + 1}`,
      userId: 'user-1',
      balanceBefore: startBalance + i * delta,
      balanceAfter: startBalance + (i + 1) * delta,
      fsAmount: delta,
    }))

  it('cadeia consistente retorna isConsistent=true e breaks=[]', async () => {
    const txs = makeChain(5)
    const fetch = jest.fn().mockResolvedValue(txs)
    const report = await auditTransactionIntegrity('user-1', fetch)
    expect(report.isConsistent).toBe(true)
    expect(report.breaks).toHaveLength(0)
    expect(report.totalTransactions).toBe(5)
  })

  it('detecta break intencional na transação 3', async () => {
    const txs = makeChain(5)
    // Introduzir inconsistência: tx[2].balanceBefore deveria ser 9800, mas é 9750
    txs[2] = { ...txs[2], balanceBefore: 9750 } as TransactionRecord
    const fetch = jest.fn().mockResolvedValue(txs)
    const report = await auditTransactionIntegrity('user-1', fetch)
    expect(report.isConsistent).toBe(false)
    expect(report.breaks).toHaveLength(1)
    expect(report.breaks[0]!.txId).toBe('tx-3')
    expect(report.breaks[0]!.delta).toBeCloseTo(-50)
  })

  it('cadeia vazia retorna consistente', async () => {
    const fetch = jest.fn().mockResolvedValue([])
    const report = await auditTransactionIntegrity('user-1', fetch)
    expect(report.isConsistent).toBe(true)
    expect(report.totalTransactions).toBe(0)
  })

  it('cadeia com campos null é ignorada (transações legadas)', async () => {
    const txs: TransactionRecord[] = [
      { id: 'tx-1', userId: 'u1', balanceBefore: null, balanceAfter: null, fsAmount: null },
      { id: 'tx-2', userId: 'u1', balanceBefore: null, balanceAfter: null, fsAmount: null },
    ]
    const fetch = jest.fn().mockResolvedValue(txs)
    const report = await auditTransactionIntegrity('user-1', fetch)
    expect(report.isConsistent).toBe(true)
  })
})
