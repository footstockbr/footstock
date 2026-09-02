// ============================================================================
// FootStock Motor — Settlement (autoridade única de liquidação financeira)
// Modelo debit-on-execute: dinheiro só muda no FILL. Usado por MARKET / LIMIT /
// OCO / SCHEDULED para que TODOS atualizem saldo + posição + transações de forma
// idêntica (antes só MARKET tocava Position e aplicava alavancagem).
//
// Garantias:
//  - CAS de status: só liquida se a ordem ainda estiver OPEN/PARTIAL (anti double-fill)
//  - Saldo nunca negativo: BUY que não cabe no saldo → ordem CANCELLED (terminal),
//    nunca deixada OPEN em retry infinito
//  - leverageDiv aplicado uniformemente (BUY 2x debita metade do valor operado)
//  - 1 TRADE + 1 FEE por ordem (defense-in-depth via índice único uq_tx_order_financial)
// Rastreabilidade: refactor fluxo de ordens 2026-06-02
// ============================================================================

import { Prisma } from '@prisma/client'
import type { OrderType, OrderSide, OrderStatus } from '../types/prisma.types'
import { calculateFee } from './fee-constants'

// Taxa de juros diária da alavancagem 2x — PROVISÓRIA (LLD Q2, owner Pedro).
// Alinhada ao valor histórico do motor; fonte única do motor. O Next (constants/
// leverage.ts) mantém cópia sincronizada e usa a taxa armazenada na própria posição.
export const LEVERAGE_DAILY_INTEREST_RATE = 0.003

export interface SettleableOrder {
  id: string
  userId: string
  assetId: string
  type: OrderType
  side: OrderSide
  quantity: number
  status: OrderStatus
  leverageMultiplier: number
}

export interface SettleResult {
  settled: boolean
  reason?: 'ALREADY_SETTLED' | 'INSUFFICIENT_BALANCE'
  newBalance?: number
  feeAmount?: number
  fsDelta?: number
}

/**
 * Snapshot de custo gravado na transacao TRADE (decisao 8 do detalhamento
 * 2026-08-24, opcao B: custo medio ponderado SEM a taxa de compra).
 *
 *  - `avgPriceAtExecution` e o `Position.avgPrice` vigente no instante do
 *    settlement, antes de a venda alterar a posicao.
 *  - `costBasisAmount = avgPriceAtExecution * quantidade vendida`.
 *  - `realizedPnl = (executionPrice - avgPriceAtExecution) * quantidade vendida`,
 *    BRUTO de taxas: a taxa da venda vive na transacao FEE propria e nunca e
 *    descontada aqui, sob pena de contar a mesma taxa duas vezes.
 *
 * BUY nao produz resultado realizado: grava apenas `positionId` e deixa os tres
 * campos financeiros nulos. Nulo aqui significa "sem apuracao", nunca zero — a
 * UI le a ausencia como proveniencia UNAVAILABLE.
 */
interface TradeCostSnapshot {
  positionId: string | null
  avgPriceAtExecution: number | null
  costBasisAmount: number | null
  realizedPnl: number | null
}

const EMPTY_COST_SNAPSHOT: TradeCostSnapshot = {
  positionId: null,
  avgPriceAtExecution: null,
  costBasisAmount: null,
  realizedPnl: null,
}

/** Colunas cost_basis_amount e realized_pnl sao DECIMAL(18,2): arredonda em centavos. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Liquida uma ordem (fill) dentro de uma transação Prisma.
 * Deve ser chamada DENTRO de um `prisma.$transaction(...)`.
 *
 * Faz CAS no status: se a ordem já não estiver OPEN/PARTIAL (concorrência / retry),
 * retorna { settled:false, reason:'ALREADY_SETTLED' } sem efeito colateral.
 */
export async function settleOrderFill(
  tx: Prisma.TransactionClient,
  order: SettleableOrder,
  executionPrice: number,
): Promise<SettleResult> {
  // --- CAS: reivindicar a ordem (anti double-fill / race entre ticks) ---
  const claim = await tx.order.updateMany({
    where: { id: order.id, status: { in: ['OPEN', 'PARTIAL'] } },
    data: { status: 'FILLED', executedPrice: executionPrice, executedAt: new Date() },
  })
  if (claim.count !== 1) {
    return { settled: false, reason: 'ALREADY_SETTLED' }
  }

  // select explícito: o settlement só precisa do saldo. Evita ler colunas que o
  // client do motor (gerado do root schema) possa ter mas o DB não — defesa contra
  // drift de schema entre root prisma/schema.prisma e a tabela real.
  const user = await tx.user.findUniqueOrThrow({
    where: { id: order.userId },
    select: { fsBalance: true },
  })
  const balanceBefore = Number(user.fsBalance)
  const operationValue = order.quantity * executionPrice
  const feeAmount = calculateFee(operationValue)
  const leverageDiv = order.leverageMultiplier === 2 ? 2 : 1

  if (order.side === 'BUY') {
    const totalCost = operationValue / leverageDiv + feeAmount
    const newBalance = balanceBefore - totalCost

    if (newBalance < 0) {
      // debit-on-execute: a ordem não reservou saldo na criação. Se o saldo não
      // cobre o custo no momento do fill, a ordem é CANCELADA (terminal) — nunca
      // deixada OPEN (evita retry infinito a cada tick).
      await tx.order.update({
        where: { id: order.id },
        // Fase 3: o motivo passa a viver na linha. Antes so existia como texto em
        // log e num canal Redis sem assinante, entao o historico da ordem nao
        // sabia dizer por que ela foi cancelada.
        data: {
          status: 'CANCELLED',
          executedPrice: null,
          executedAt: null,
          fee: 0,
          cancelReason: 'INSUFFICIENT_BALANCE',
          nextAttemptAt: null,
        },
      })
      return { settled: false, reason: 'INSUFFICIENT_BALANCE' }
    }

    await tx.order.update({ where: { id: order.id }, data: { fee: feeAmount } })
    await tx.user.update({ where: { id: order.userId }, data: { fsBalance: newBalance } })

    // Upsert posição LONG
    const existing = await tx.position.findFirst({
      where: { userId: order.userId, assetId: order.assetId, side: 'LONG', status: 'OPEN' },
    })
    let positionId: string | null = null
    if (existing) {
      const newQty = existing.quantity + order.quantity
      const newAvg = (existing.quantity * Number(existing.avgPrice) + order.quantity * executionPrice) / newQty
      await tx.position.update({
        where: { id: existing.id },
        data: { quantity: newQty, avgPrice: newAvg, totalInvested: { increment: operationValue } },
      })
      positionId = existing.id
    } else {
      // Alavancagem 2x (Lenda): parte emprestada = metade do valor operado.
      const leverageAmount = leverageDiv === 2 ? operationValue / 2 : 0
      const dailyInterestRate = leverageDiv === 2 ? LEVERAGE_DAILY_INTEREST_RATE : 0
      const created = await tx.position.create({
        data: {
          userId: order.userId, assetId: order.assetId,
          quantity: order.quantity, avgPrice: executionPrice,
          totalInvested: operationValue, side: 'LONG', status: 'OPEN',
          leverageMultiplier: order.leverageMultiplier,
          leverageAmount, dailyInterestRate,
          openedAt: new Date(),
        },
      })
      positionId = created?.id ?? null
    }

    await _recordTradeAndFee(tx, order, executionPrice, feeAmount, -totalCost, balanceBefore, newBalance, {
      ...EMPTY_COST_SNAPSHOT,
      positionId,
    })
    return { settled: true, newBalance, feeAmount, fsDelta: -totalCost }
  }

  // --- SELL: reduz/encerra posição LONG e credita o líquido ---
  const proceeds = operationValue - feeAmount
  const newBalance = balanceBefore + proceeds

  await tx.order.update({ where: { id: order.id }, data: { fee: feeAmount } })
  await tx.user.update({ where: { id: order.userId }, data: { fsBalance: newBalance } })

  const existing = await tx.position.findFirst({
    where: { userId: order.userId, assetId: order.assetId, side: 'LONG', status: 'OPEN' },
  })
  let costSnapshot: TradeCostSnapshot = { ...EMPTY_COST_SNAPSHOT }
  if (existing) {
    // avgPrice VIGENTE (antes desta venda): base do custo e do resultado realizado.
    const avgPriceAtExecution = Number(existing.avgPrice)
    const costBasisAmount = roundCents(avgPriceAtExecution * order.quantity)
    const realizedPnl = roundCents((executionPrice - avgPriceAtExecution) * order.quantity)
    costSnapshot = { positionId: existing.id, avgPriceAtExecution, costBasisAmount, realizedPnl }

    const newQty = existing.quantity - order.quantity
    if (newQty > 0) {
      // Venda parcial: sai da posicao o CUSTO da parcela vendida, nao o valor
      // recebido. Piso em zero para que arredondamento nunca deixe custo negativo.
      const remainingInvested = Math.max(0, roundCents(Number(existing.totalInvested) - costBasisAmount))
      await tx.position.update({
        where: { id: existing.id },
        data: { quantity: newQty, totalInvested: remainingInvested },
      })
    } else {
      // Venda total: nao sobra custo nem quantidade na posicao.
      await tx.position.update({
        where: { id: existing.id },
        data: { quantity: 0, totalInvested: 0, status: 'CLOSED' },
      })
    }
  }

  await _recordTradeAndFee(tx, order, executionPrice, feeAmount, proceeds, balanceBefore, newBalance, costSnapshot)
  return { settled: true, newBalance, feeAmount, fsDelta: proceeds }
}

/**
 * Registra TRADE (operação principal) + FEE (linha separada da taxa).
 * Idempotência primária: o CAS de status em settleOrderFill garante 1 liquidação
 * por ordem. O índice único uq_tx_order_financial é a última linha de defesa.
 */
async function _recordTradeAndFee(
  tx: Prisma.TransactionClient,
  order: SettleableOrder,
  executionPrice: number,
  feeAmount: number,
  fsDelta: number,
  balanceBefore: number,
  balanceAfter: number,
  costSnapshot: TradeCostSnapshot,
): Promise<void> {
  await tx.transaction.create({
    data: {
      userId: order.userId, assetId: order.assetId, orderId: order.id,
      type: order.type, financialType: 'TRADE', side: order.side,
      quantity: order.quantity, price: executionPrice, fee: feeAmount,
      totalAmount: Math.abs(fsDelta),
      fsAmount: fsDelta,
      balanceBefore, balanceAfter,
      // Snapshot de custo: so a linha TRADE carrega. A FEE e memorando.
      positionId: costSnapshot.positionId,
      avgPriceAtExecution: costSnapshot.avgPriceAtExecution,
      costBasisAmount: costSnapshot.costBasisAmount,
      realizedPnl: costSnapshot.realizedPnl,
    },
  })

  await tx.transaction.create({
    data: {
      userId: order.userId, assetId: order.assetId, orderId: order.id,
      type: order.type, financialType: 'FEE', side: order.side,
      quantity: order.quantity, price: executionPrice, fee: feeAmount,
      totalAmount: feeAmount,
      fsAmount: -feeAmount,
      balanceBefore: null, balanceAfter: null,
    },
  })
}
