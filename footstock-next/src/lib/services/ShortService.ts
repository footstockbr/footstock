// ============================================================================
// FootStock — ShortService
// Short selling com margem 150%, aluguel diário 0,5% e fechamento com P&L.
// Rastreabilidade: INT-014 / TASK-4
// ============================================================================

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { PLAN_TYPE } from '@/lib/enums'
import { verifyMarginConsistency } from '@/lib/contracts/transaction-contract'
import { calculateFee } from '@/lib/services/plan-order-limits'
import { AppError } from '@/lib/services/OrderService'
import { leagueEventRecorder } from '@/lib/services/leagues/LeagueEventRecorder'
import type { Position, Transaction } from '@prisma/client'

type PositionWithAsset = Prisma.PositionGetPayload<{
  include: { asset: { select: { ticker: true; currentPrice: true; id: true } } }
}>

const SHORT_MARGIN_RATIO = 1.5       // 150% de margem
const SHORT_DAILY_INTEREST_RATE = 0.005  // 0,5% ao dia

export class ShortService {
  /**
   * Abre uma posição short com bloqueio de 150% de margem.
   * Requer plano LENDA.
   */
  async openShort(
    userId: string,
    assetId: string,
    quantity: number,
    currentPrice: number,
  ): Promise<Position> {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError('AUTH-001', 401)

    // Staff (ADMIN / CLUB_PARTNER) não opera ordens — nem short, nem long.
    if (user.userType === 'ADMIN' || user.userType === 'CLUB_PARTNER' || !user.planType) {
      throw new AppError('STAFF_CANNOT_TRADE', 403, {
        message: 'Contas administrativas/institucionais nao podem operar short.',
      })
    }

    // Guard de plano
    if (user.planType !== PLAN_TYPE.LENDA) {
      throw new AppError('ORDER_051', 403, {
        requiredPlan: PLAN_TYPE.LENDA,
        feature: 'short_selling',
        message: 'Short selling requer plano LENDA.',
      })
    }

    const operationValue = quantity * currentPrice
    const marginRequired = operationValue * SHORT_MARGIN_RATIO
    const feeAmount = calculateFee(operationValue)
    const totalRequired = marginRequired + feeAmount

    // Verificação de saldo (margem + taxa)
    const fsBalance = Number(user.fsBalance)
    if (fsBalance < totalRequired) {
      throw new AppError('ORDER_056', 422, {
        required: totalRequired,
        available: fsBalance,
        message: `Margem + taxa insuficiente. Necessário FS$ ${totalRequired.toFixed(2)}, disponível FS$ ${fsBalance.toFixed(2)}.`,
      })
    }

    if (!verifyMarginConsistency(marginRequired, fsBalance)) {
      throw new AppError('ORDER_056', 422, { message: 'Consistência de margem inválida.' })
    }

    return await prisma.$transaction(async (tx) => {
      // Re-lê o usuário DENTRO da transação (o read externo pode estar stale).
      const freshUser = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      const balanceBefore = Number(freshUser.fsBalance)
      if (balanceBefore < totalRequired) {
        throw new AppError('ORDER_056', 422, {
          required: totalRequired,
          available: balanceBefore,
          message: `Margem + taxa insuficiente. Necessário FS$ ${totalRequired.toFixed(2)}, disponível FS$ ${balanceBefore.toFixed(2)}.`,
        })
      }
      const newBalance = balanceBefore - totalRequired

      // Débito por CAS condicional: bloqueia margem + debita em update relativo
      // (decrement/increment) sob WHERE fsBalance >= totalRequired. Evita saldo
      // negativo e perda de débito quando dois shorts abrem concorrentemente.
      const debit = await tx.user.updateMany({
        where: { id: userId, fsBalance: { gte: totalRequired } },
        data: {
          fsBalance: { decrement: totalRequired },
          marginBlocked: { increment: marginRequired },
        },
      })
      if (debit.count !== 1) {
        throw new AppError('ORDER_056', 422, {
          required: totalRequired,
          message: 'Saldo insuficiente para abrir short (atualização concorrente). Tente novamente.',
        })
      }

      const position = await tx.position.create({
        data: {
          userId,
          assetId,
          quantity,
          avgPrice: currentPrice,
          totalInvested: operationValue,
          side: 'SHORT',
          marginBlocked: marginRequired,
          dailyInterestRate: SHORT_DAILY_INTEREST_RATE,
          interestAccrued: 0,
        },
      })

      await tx.transaction.create({
        data: {
          userId,
          assetId,
          type: 'MARKET',
          financialType: 'MARGIN_BLOCKED',
          side: 'SELL',
          quantity,
          price: currentPrice,
          fee: feeAmount,
          totalAmount: totalRequired,
          fsAmount: -totalRequired,
          balanceBefore,
          balanceAfter: newBalance,
        },
      })

      return position
    }, { isolationLevel: 'Serializable' })
  }

  /**
   * Fecha uma posição short com cálculo de P&L.
   * Short lucra quando preço CAI abaixo do preço de abertura.
   */
  async closeShort(
    userId: string,
    positionId: string,
    currentPrice: number,
    _reason?: string,
  ): Promise<{ pnl: number; transaction: Transaction }> {
    const position = await prisma.position.findUnique({ where: { id: positionId } })
    if (!position || position.userId !== userId) {
      throw new AppError('ORDER_080', 404, { message: 'Posição não encontrada.' })
    }
    if (position.side !== 'SHORT' || position.status !== 'OPEN') {
      throw new AppError('ORDER_053', 422, { message: 'Posição não é um short aberto.' })
    }

    const avgPrice = Number(position.avgPrice)
    const interestAccrued = Number(position.interestAccrued)
    const marginBlocked = Number(position.marginBlocked)

    // Taxa fixa de fechamento
    const closeOperationValue = Number(position.quantity) * currentPrice
    const closeFee = calculateFee(closeOperationValue)

    // P&L: positivo quando preço caiu (short ganhou), menos juros e taxa
    const pnl = (avgPrice - currentPrice) * Number(position.quantity) - interestAccrued - closeFee

    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.position.updateMany({
        where: { id: positionId, userId, side: 'SHORT', status: 'OPEN' },
        data: { status: 'CLOSED', quantity: 0 },
      })
      if (claim.count !== 1) {
        throw new AppError('ORDER_053', 422, { message: 'Posição não é um short aberto.' })
      }

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })

      const balanceBefore = Number(user.fsBalance)
      const returnAmount = marginBlocked + pnl // pode ser negativo se short perdeu
      const newBalance = balanceBefore + returnAmount
      const newMarginBlocked = Math.max(0, Number(user.marginBlocked) - marginBlocked)

      await tx.user.update({
        where: { id: userId },
        data: { fsBalance: newBalance, marginBlocked: newMarginBlocked },
      })

      const transaction = await tx.transaction.create({
        data: {
          userId,
          assetId: position.assetId,
          type: 'MARKET',
          financialType: 'SHORT_CLOSE',
          side: 'BUY',
          quantity: position.quantity,
          price: currentPrice,
          fee: closeFee,
          totalAmount: closeOperationValue,
          fsAmount: returnAmount,
          balanceBefore,
          balanceAfter: newBalance,
        },
      })

      return { pnl, transaction }
    })

    if (result.pnl > 0) {
      leagueEventRecorder.recordForAllActiveLeagues(userId, 'SHORT_PROFITABLE_CLOSED', { pnl: result.pnl }).catch(() => {})
    }

    return result
  }

  /**
   * Cobra aluguel diário de 0,5% sobre o valor nocional da posição (qty * currentPrice).
   * INTAKE canônico: base = valor nocional, NÃO marginBlocked.
   * Chamado pelo job interest-accrual.ts.
   */
  async accrueInterest(positionId: string): Promise<number> {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { asset: { select: { id: true, ticker: true, currentPrice: true } } },
    }) as PositionWithAsset | null
    if (!position || position.side !== 'SHORT' || position.status !== 'OPEN') return 0

    // INTAKE: 0.5% do valor nocional (qty * currentPrice), NÃO da marginBlocked
    let currentPrice: number
    try {
      const redisPriceStr = await redis.get(`price:${position.asset.ticker}`)
      currentPrice = redisPriceStr ? parseFloat(redisPriceStr) : Number(position.asset.currentPrice)
    } catch {
      currentPrice = Number(position.asset.currentPrice)
    }
    const notionalValue = Number(position.quantity) * currentPrice
    const rawInterest = notionalValue * Number(position.dailyInterestRate)

    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: position.userId } })
      const balanceBefore = Number(user.fsBalance)
      // Guard: cobrar no máximo até zerar saldo (nunca negativo)
      const dailyInterest = Math.min(rawInterest, Math.max(0, balanceBefore))
      const newBalance = balanceBefore - dailyInterest

      await tx.user.update({ where: { id: position.userId }, data: { fsBalance: newBalance } })
      await tx.position.update({
        where: { id: positionId },
        data: { interestAccrued: { increment: dailyInterest } },
      })
      await tx.transaction.create({
        data: {
          userId: position.userId,
          assetId: position.assetId,
          type: 'MARKET',
          financialType: 'SHORT_INTEREST',
          side: 'SELL',
          quantity: position.quantity,
          price: currentPrice,
          fee: 0,
          totalAmount: dailyInterest,
          fsAmount: -dailyInterest,
          balanceBefore,
          balanceAfter: newBalance,
        },
      })

      // Alert se saldo zerou após cobrança
      if (newBalance <= 0) {
        await redis.publish(
          `notifications:${position.userId}`,
          JSON.stringify({
            type: 'MARGIN_CALL_ALERT',
            positionId,
            message: 'Saldo insuficiente para cobrir aluguel do short. Risco de liquidação.',
          })
        ).catch(() => {})
      }

      return dailyInterest
    })
  }
}

export const shortService = new ShortService()
