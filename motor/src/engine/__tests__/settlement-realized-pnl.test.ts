/**
 * @jest-environment node
 */
// ============================================================================
// settlement — snapshot de custo e resultado realizado (decisao 8, opcao B)
//
// Cobre: SELL parcial (baixa de custo pelo costBasis), SELL total (posicao
// fechada e zerada), retry/CAS (sem duplicar TRADE, FEE nem P/L), reconciliacao
// entre P/L realizado e nao realizado, e a regra de que a taxa da venda NAO
// entra no realizedPnl (ela vive na transacao FEE).
// ============================================================================

import { settleOrderFill, type SettleableOrder } from '../settlement'
import { calculateFee } from '../fee-constants'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<SettleableOrder> = {}): SettleableOrder {
  return {
    id: 'order-1',
    userId: 'user-1',
    assetId: 'asset-1',
    type: 'MARKET',
    side: 'SELL',
    quantity: 4,
    status: 'OPEN',
    leverageMultiplier: 1,
    ...overrides,
  }
}

function makePosition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pos-1',
    userId: 'user-1',
    assetId: 'asset-1',
    quantity: 10,
    avgPrice: 10,
    totalInvested: 100,
    side: 'LONG',
    status: 'OPEN',
    ...overrides,
  }
}

/** Mock do TransactionClient do Prisma. `claims` alimenta o CAS de status. */
function makeTx(position: Record<string, unknown> | null = null, balance = 1000, claims: number[] = [1]) {
  const queue = [...claims]
  return {
    order: {
      updateMany: jest.fn().mockImplementation(async () => ({ count: queue.length ? queue.shift() : 0 })),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ fsBalance: balance }),
      update: jest.fn().mockResolvedValue({}),
    },
    position: {
      findFirst: jest.fn().mockResolvedValue(position),
      create: jest.fn().mockResolvedValue({ id: 'pos-nova' }),
      update: jest.fn().mockResolvedValue({}),
    },
    transaction: {
      create: jest.fn().mockResolvedValue({}),
    },
  }
}

type TxMock = ReturnType<typeof makeTx>

/** Extrai o `data` da transacao criada com o financialType pedido. */
function txData(tx: TxMock, financialType: 'TRADE' | 'FEE'): any {
  const call = tx.transaction.create.mock.calls.find(
    (c: any[]) => c[0]?.data?.financialType === financialType,
  )
  return call ? (call[0] as any).data : undefined
}

// ─── SELL parcial ────────────────────────────────────────────────────────────

describe('settleOrderFill — SELL parcial', () => {
  it('reduz quantity e da baixa no totalInvested pelo custo da parcela vendida', async () => {
    const tx = makeTx(makePosition())
    const result = await settleOrderFill(tx as any, makeOrder({ quantity: 4 }), 15)

    expect(result.settled).toBe(true)
    expect(tx.position.update).toHaveBeenCalledTimes(1)
    const update = tx.position.update.mock.calls[0][0] as any
    expect(update.where).toEqual({ id: 'pos-1' })
    // custo da parcela = avgPrice 10 * 4 = 40 → 100 - 40 = 60
    expect(update.data).toEqual({ quantity: 6, totalInvested: 60 })
    expect(update.data.status).toBeUndefined()
  })

  it('grava o snapshot de custo na linha TRADE, dentro da mesma transacao Prisma', async () => {
    const tx = makeTx(makePosition())
    await settleOrderFill(tx as any, makeOrder({ quantity: 4 }), 15)

    const trade = txData(tx, 'TRADE')
    expect(trade.positionId).toBe('pos-1')
    expect(trade.avgPriceAtExecution).toBe(10)
    expect(trade.costBasisAmount).toBe(40)
    expect(trade.realizedPnl).toBe(20) // (15 - 10) * 4
    // As duas transacoes saem do mesmo `tx` recebido: nenhum client proprio.
    expect(tx.transaction.create).toHaveBeenCalledTimes(2)
  })

  it('nao carrega snapshot na linha FEE, que e memorando', async () => {
    const tx = makeTx(makePosition())
    await settleOrderFill(tx as any, makeOrder({ quantity: 4 }), 15)

    const fee = txData(tx, 'FEE')
    expect(fee.positionId).toBeUndefined()
    expect(fee.avgPriceAtExecution).toBeUndefined()
    expect(fee.costBasisAmount).toBeUndefined()
    expect(fee.realizedPnl).toBeUndefined()
    expect(fee.balanceBefore).toBeNull()
    expect(fee.balanceAfter).toBeNull()
  })

  it('nao conta o mesmo custo duas vezes: realizado + nao realizado = P/L total', async () => {
    const tx = makeTx(makePosition())
    const price = 15
    await settleOrderFill(tx as any, makeOrder({ quantity: 4 }), price)

    const trade = txData(tx, 'TRADE')
    const posAfter = (tx.position.update.mock.calls[0][0] as any).data
    // P/L nao realizado do que sobrou, com o totalInvested ja reduzido.
    const unrealized = price * posAfter.quantity - posAfter.totalInvested
    // P/L total da posicao original, se tudo fosse marcado a 15.
    const totalPnl = (price - 10) * 10

    expect(unrealized).toBe(30)
    expect(trade.realizedPnl + unrealized).toBe(totalPnl)
    // O custo restante segue coerente com a quantidade restante.
    expect(posAfter.totalInvested).toBe(10 * posAfter.quantity)
  })
})

// ─── SELL total ──────────────────────────────────────────────────────────────

describe('settleOrderFill — SELL total', () => {
  it('zera quantity e totalInvested e fecha a posicao', async () => {
    const tx = makeTx(makePosition())
    await settleOrderFill(tx as any, makeOrder({ quantity: 10 }), 15)

    const update = tx.position.update.mock.calls[0][0] as any
    expect(update.data).toEqual({ quantity: 0, totalInvested: 0, status: 'CLOSED' })

    const trade = txData(tx, 'TRADE')
    expect(trade.costBasisAmount).toBe(100)
    expect(trade.realizedPnl).toBe(50) // (15 - 10) * 10
  })

  it('mantem piso zero no custo quando a venda excede a quantidade da posicao', async () => {
    const tx = makeTx(makePosition({ quantity: 4, totalInvested: 40 }))
    await settleOrderFill(tx as any, makeOrder({ quantity: 10 }), 15)

    const update = tx.position.update.mock.calls[0][0] as any
    expect(update.data).toEqual({ quantity: 0, totalInvested: 0, status: 'CLOSED' })
  })
})

// ─── Taxa fora do resultado realizado ────────────────────────────────────────

describe('settleOrderFill — taxa nao entra no realizedPnl', () => {
  it('grava (executionPrice - avgPriceAtExecution) * quantidade, bruto da taxa da venda', async () => {
    const tx = makeTx(makePosition({ quantity: 100, totalInvested: 1000 }))
    const executionPrice = 15
    const quantity = 100
    await settleOrderFill(tx as any, makeOrder({ quantity }), executionPrice)

    const feeAmount = calculateFee(quantity * executionPrice)
    expect(feeAmount).toBeGreaterThan(0) // faixa acima de FS$ 1.000 → 0.45

    const trade = txData(tx, 'TRADE')
    expect(trade.realizedPnl).toBe((executionPrice - 10) * quantity)
    expect(trade.realizedPnl).not.toBe((executionPrice - 10) * quantity - feeAmount)
    // A taxa aparece uma unica vez, na linha FEE.
    expect(txData(tx, 'FEE').fsAmount).toBe(-feeAmount)
    // E o caixa creditado ja e liquido dela.
    expect(trade.fsAmount).toBe(quantity * executionPrice - feeAmount)
  })
})

// ─── Retry / CAS ─────────────────────────────────────────────────────────────

describe('settleOrderFill — retry e CAS', () => {
  it('segunda chamada nao duplica TRADE, FEE, baixa de custo nem P/L', async () => {
    const tx = makeTx(makePosition(), 1000, [1, 0])
    const order = makeOrder({ quantity: 4 })

    const first = await settleOrderFill(tx as any, order, 15)
    const second = await settleOrderFill(tx as any, order, 15)

    expect(first.settled).toBe(true)
    expect(second).toEqual({ settled: false, reason: 'ALREADY_SETTLED' })
    expect(tx.transaction.create).toHaveBeenCalledTimes(2) // 1 TRADE + 1 FEE, so da primeira
    expect(tx.position.update).toHaveBeenCalledTimes(1)
    expect(tx.user.update).toHaveBeenCalledTimes(1)
  })

  it('CAS perdido nao toca posicao nem transacoes', async () => {
    const tx = makeTx(makePosition(), 1000, [0])
    const result = await settleOrderFill(tx as any, makeOrder({ quantity: 4 }), 15)

    expect(result.reason).toBe('ALREADY_SETTLED')
    expect(tx.transaction.create).not.toHaveBeenCalled()
    expect(tx.position.update).not.toHaveBeenCalled()
  })
})

// ─── Ausencia de base para apurar ────────────────────────────────────────────

describe('settleOrderFill — sem base de custo', () => {
  it('SELL sem posicao aberta grava snapshot nulo, nunca zero fabricado', async () => {
    const tx = makeTx(null)
    await settleOrderFill(tx as any, makeOrder({ quantity: 4 }), 15)

    const trade = txData(tx, 'TRADE')
    expect(trade.positionId).toBeNull()
    expect(trade.avgPriceAtExecution).toBeNull()
    expect(trade.costBasisAmount).toBeNull()
    expect(trade.realizedPnl).toBeNull()
  })

  it('BUY grava positionId e deixa os campos financeiros nulos', async () => {
    const tx = makeTx(null, 10000)
    await settleOrderFill(tx as any, makeOrder({ side: 'BUY', quantity: 4 }), 15)

    const trade = txData(tx, 'TRADE')
    expect(trade.positionId).toBe('pos-nova') // posicao criada nesta compra
    expect(trade.avgPriceAtExecution).toBeNull()
    expect(trade.costBasisAmount).toBeNull()
    expect(trade.realizedPnl).toBeNull()
  })

  it('BUY em posicao existente reaproveita o id da posicao', async () => {
    const tx = makeTx(makePosition(), 10000)
    await settleOrderFill(tx as any, makeOrder({ side: 'BUY', quantity: 4 }), 15)

    expect(txData(tx, 'TRADE').positionId).toBe('pos-1')
  })
})
