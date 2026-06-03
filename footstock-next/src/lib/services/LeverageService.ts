// ============================================================================
// FootStock — LeverageService
// Alavancagem 2x exclusiva do plano Lenda.
// Gerencia validação, juros diários e liquidação automática de posições LONG.
// Rastreabilidade: T-003 / INT-TRD-005
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { PLAN_TYPE } from '@/lib/enums'
import {
  LEVERAGE_DAILY_INTEREST_RATE,
  LEVERAGE_MULTIPLIER,
  LEVERAGE_LIQUIDATION_THRESHOLD,
} from '@/lib/constants/leverage'

// Re-exporta para compatibilidade com importadores que usavam este módulo
export { LEVERAGE_DAILY_INTEREST_RATE, LEVERAGE_MULTIPLIER, LEVERAGE_LIQUIDATION_THRESHOLD }

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LeverageValidation {
  valid: boolean
  errorCode?: string
  message?: string
}

export interface AccrualResult {
  positionId: string
  interest: number
  accrued: boolean
  liquidated: boolean
}

// ─── LeverageService ──────────────────────────────────────────────────────────

export class LeverageService {
  /**
   * Valida se um usuário pode criar uma ordem alavancada.
   * Verifica:
   * 1. Plano LENDA obrigatório
   * 2. Se leagueId fornecido: liga deve ter permiteAlavancagem = true
   */
  async validateLeverage(userId: string, leagueId?: string): Promise<LeverageValidation> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, userType: true },
    })

    if (!user) {
      return { valid: false, errorCode: 'AUTH-001', message: 'Usuário não encontrado.' }
    }

    // Staff (ADMIN / CLUB_PARTNER): não opera ordens, logo não pode alavancar.
    if (user.userType === 'ADMIN' || user.userType === 'CLUB_PARTNER' || !user.planType) {
      return {
        valid: false,
        errorCode: 'STAFF_CANNOT_TRADE',
        message: 'Alavancagem indisponível para contas administrativas/institucionais.',
      }
    }

    // Contexto de liga PRO: alavancagem controlada pelo toggle da liga, não pelo plano
    if (leagueId) {
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, type: true, permiteAlavancagem: true },
      })

      if (!league) {
        return { valid: false, errorCode: 'LEAGUE_001', message: 'Liga não encontrada.' }
      }

      if (league.type === 'PRO') {
        if (league.permiteAlavancagem) {
          // Liga PRO com alavancagem habilitada: qualquer plano pode usar 2x nesta liga
          return { valid: true }
        } else {
          // Liga PRO com alavancagem desabilitada: nenhum plano pode usar, incluindo LENDA
          return {
            valid: false,
            errorCode: 'ORDER_059',
            message: 'Esta liga PRO não permite ordens alavancadas.',
          }
        }
      }
    }

    // Fora de liga PRO: somente LENDA pode usar alavancagem
    if (user.planType !== PLAN_TYPE.LENDA) {
      return {
        valid: false,
        errorCode: 'ORDER_051',
        message: `Alavancagem 2x requer plano LENDA. Plano atual: ${user.planType}.`,
      }
    }

    return { valid: true }
  }

  /**
   * Calcula a taxa de juros diária sobre o crédito de alavancagem.
   * Base: leverageAmount (crédito virtual tomado da plataforma).
   */
  calculateLeverageFee(leverageAmount: number, dailyRate = LEVERAGE_DAILY_INTEREST_RATE): number {
    if (leverageAmount <= 0 || dailyRate <= 0) return 0
    return leverageAmount * dailyRate
  }

  /**
   * Cobra juros diários de alavancagem sobre uma posição LONG alavancada.
   * Análogo ao ShortService.accrueInterest para posições SHORT.
   * Chamado pelo job leverage-interest.ts (cron 0 7 * * *).
   *
   * Lógica:
   * - Base de cobrança: leverageAmount (crédito tomado da plataforma)
   * - Taxa: LEVERAGE_DAILY_INTEREST_RATE (0,2%/dia)
   * - Cobrança máxima = saldo disponível (nunca fica negativo)
   * - Após cobrança, verifica limiar de liquidação
   */
  async accrueInterest(positionId: string): Promise<AccrualResult> {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
    })

    if (!position || position.side !== 'LONG' || position.status !== 'OPEN') {
      return { positionId, interest: 0, accrued: false, liquidated: false }
    }

    if (Number(position.leverageMultiplier) <= 1 || Number(position.leverageAmount) <= 0) {
      return { positionId, interest: 0, accrued: false, liquidated: false }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Idempotência por (posição, dia BRT): CAS em last_interest_charged_at.
      // Só cobra se nunca cobrado OU se a última cobrança foi antes do início do
      // dia BRT atual. Garante cobrança única por dia mesmo com retry do cron.
      const todayStartBRT = LeverageService._brtDayStartUtc()
      const claim = await tx.position.updateMany({
        where: {
          id: positionId,
          status: 'OPEN',
          leverageAmount: { gt: 0 },
          OR: [
            { lastInterestChargedAt: null },
            { lastInterestChargedAt: { lt: todayStartBRT } },
          ],
        },
        data: { lastInterestChargedAt: new Date() },
      })
      if (claim.count !== 1) {
        // Já cobrado hoje (ou posição não-elegível) → skip idempotente
        return { dailyInterest: 0, newBalance: 0, skipped: true }
      }

      // Re-lê posição dentro da transação para evitar race condition com venda/fechamento
      const freshPos = await tx.position.findUnique({ where: { id: positionId } })
      if (!freshPos || freshPos.status !== 'OPEN' || Number(freshPos.leverageAmount) <= 0) {
        return { dailyInterest: 0, newBalance: 0, skipped: true }
      }

      const leverageAmount = Number(freshPos.leverageAmount)
      // Usa a taxa armazenada na posição (configurada no momento da execução)
      const rate = Number(freshPos.dailyInterestRate) > 0
        ? Number(freshPos.dailyInterestRate)
        : LEVERAGE_DAILY_INTEREST_RATE
      const rawInterest = this.calculateLeverageFee(leverageAmount, rate)

      const user = await tx.user.findUniqueOrThrow({ where: { id: freshPos.userId } })
      const balanceBefore = Number(user.fsBalance)

      // Guard: cobrar no máximo até zerar saldo (nunca negativo)
      const dailyInterest = Math.min(rawInterest, Math.max(0, balanceBefore))
      const newBalance = balanceBefore - dailyInterest

      if (dailyInterest > 0) {
        await tx.user.update({
          where: { id: freshPos.userId },
          data: { fsBalance: newBalance },
        })

        await tx.position.update({
          where: { id: positionId },
          data: { interestAccrued: { increment: dailyInterest } },
        })

        await tx.transaction.create({
          data: {
            userId: freshPos.userId,
            assetId: freshPos.assetId,
            type: 'MARKET',
            financialType: 'LEVERAGE_INTEREST',
            side: 'SELL',
            quantity: freshPos.quantity,
            price: Number(freshPos.avgPrice),
            fee: 0,
            totalAmount: dailyInterest,
            fsAmount: -dailyInterest,
            balanceBefore,
            balanceAfter: newBalance,
          },
        })
      }

      return { dailyInterest, newBalance, skipped: false }
    })

    if (result.skipped) {
      return { positionId, interest: 0, accrued: false, liquidated: false }
    }

    // Verificar liquidação automática após cobrança de juros
    const liquidated = await this.checkAndLiquidate(positionId)

    // Alerta de saldo baixo
    if (result.newBalance <= 0) {
      await redis.publish(
        `notifications:${position.userId}`,
        JSON.stringify({
          type: 'MARGIN_CALL_ALERT',
          positionId,
          message: 'Saldo insuficiente para cobrir juros de alavancagem. Risco de liquidação.',
        })
      ).catch(() => {})
    }

    return {
      positionId,
      interest: result.dailyInterest,
      accrued: result.dailyInterest > 0,
      liquidated,
    }
  }

  /**
   * Verifica se a posição deve ser liquidada automaticamente.
   * Critério: perda acumulada (juros + queda de preço) > 80% do leverageAmount.
   *
   * Quando liquidado:
   * - Posição fechada com status CLOSED
   * - leverageAmount zerado
   * - Notificação enviada ao usuário
   */
  async checkAndLiquidate(positionId: string): Promise<boolean> {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { asset: { select: { ticker: true, currentPrice: true } } },
    })

    if (!position || position.side !== 'LONG' || position.status !== 'OPEN') return false
    if (Number(position.leverageMultiplier) <= 1) return false

    const leverageAmount = Number(position.leverageAmount)
    if (leverageAmount <= 0) return false

    // Tentar preço atual do Redis (mais recente que DB)
    let currentPrice: number
    try {
      const redisPriceStr = await redis.get(`price:${position.asset.ticker}`)
      currentPrice = redisPriceStr ? parseFloat(redisPriceStr) : Number(position.asset.currentPrice)
    } catch {
      currentPrice = Number(position.asset.currentPrice)
    }

    const avgPrice = Number(position.avgPrice)
    const qty = Number(position.quantity)
    const interestAccrued = Number(position.interestAccrued)

    // Perda total = queda de preço + juros acumulados
    const priceLoss = Math.max(0, (avgPrice - currentPrice) * qty)
    const totalLoss = priceLoss + interestAccrued

    const shouldLiquidate = totalLoss >= leverageAmount * LEVERAGE_LIQUIDATION_THRESHOLD

    if (!shouldLiquidate) return false

    // Liquidar posição atomicamente com registro contábil completo
    await prisma.$transaction(async (tx) => {
      // Re-validar dentro da transação (race guard)
      const freshPos = await tx.position.findUnique({ where: { id: positionId } })
      if (!freshPos || freshPos.status !== 'OPEN') return

      const user = await tx.user.findUniqueOrThrow({ where: { id: position.userId } })
      const balanceBefore = Number(user.fsBalance)

      // P&L da liquidação: valor a mercado - capital próprio investido - juros - dívida
      const ownCapital = Number(freshPos.totalInvested) - leverageAmount
      const liquidationValue = qty * currentPrice
      // O que sobra para o usuário: valor a mercado - dívida pendente (pode ser negativo)
      const netReturn = liquidationValue - leverageAmount - Number(freshPos.interestAccrued)
      const returnToUser = Math.max(0, netReturn) // nunca devolve mais do que tem
      const newBalance = balanceBefore + returnToUser

      await tx.user.update({
        where: { id: position.userId },
        data: { fsBalance: newBalance },
      })

      await tx.position.update({
        where: { id: positionId },
        data: { status: 'CLOSED', quantity: 0, leverageAmount: 0, leverageMultiplier: 1, dailyInterestRate: 0 },
      })

      // Registro contábil da liquidação forçada
      await tx.transaction.create({
        data: {
          userId: position.userId,
          assetId: position.assetId,
          type: 'MARKET',
          financialType: 'LEVERAGE_INTEREST', // Reusa tipo existente para liquidação forçada
          side: 'SELL',
          quantity: qty,
          price: currentPrice,
          fee: 0,
          totalAmount: liquidationValue,
          fsAmount: returnToUser,
          balanceBefore,
          balanceAfter: newBalance,
        },
      })

      void ownCapital // ownCapital calculado mas não usado diretamente — mantido para auditoria futura
    })

    // Notificar usuário
    await redis.publish(
      `notifications:${position.userId}`,
      JSON.stringify({
        type: 'MARGIN_CALL_ALERT',
        positionId,
        ticker: position.asset.ticker,
        message: `Posição alavancada ${position.asset.ticker} liquidada automaticamente. Perda de FS$${totalLoss.toFixed(2)} superou o limite de crédito.`,
      })
    ).catch(() => {})

    return true
  }

  /**
   * Encerramento compulsório a preço de mercado por razão externa (ex: CANCELLATION_LOCK).
   * Diferente de checkAndLiquidate (margin call): não verifica limite de perda —
   * simplesmente liquida a posição ao preço informado.
   * Aplica floor de FS$0 no retorno ao usuário (nunca saldo negativo por esta operação).
   */
  async forceCloseLeveraged(positionId: string, currentPrice: number, reason: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const position = await tx.position.findUnique({
        where: { id: positionId },
        include: { asset: { select: { ticker: true } } },
      })

      if (!position || position.status !== 'OPEN') return false
      if (Number(position.leverageMultiplier) <= 1) return false

      const user = await tx.user.findUniqueOrThrow({ where: { id: position.userId } })
      const balanceBefore = Number(user.fsBalance)
      const qty = Number(position.quantity)
      const leverageAmount = Number(position.leverageAmount)
      const interestAccrued = Number(position.interestAccrued)

      // Valor de mercado - dívida de alavancagem - juros acumulados
      const liquidationValue = qty * currentPrice
      const netReturn = liquidationValue - leverageAmount - interestAccrued
      // floor em 0: usuário nunca perde mais do que investiu (FS$ simulado)
      const returnToUser = Math.max(0, netReturn)
      const newMarginBlocked = Math.max(0, Number(user.marginBlocked) - leverageAmount)

      const claim = await tx.position.updateMany({
        where: { id: positionId, status: 'OPEN' },
        data: { status: 'CLOSED', quantity: 0 },
      })
      if (claim.count !== 1) return false

      await tx.user.update({
        where: { id: position.userId },
        data: {
          fsBalance: balanceBefore + returnToUser,
          marginBlocked: newMarginBlocked,
        },
      })

      await tx.transaction.create({
        data: {
          userId: position.userId,
          assetId: position.assetId,
          type: 'MARKET',
          financialType: 'TRADE',
          side: 'SELL',
          quantity: position.quantity,
          price: currentPrice,
          fee: 0,
          totalAmount: liquidationValue,
          fsAmount: returnToUser,
          balanceBefore,
          balanceAfter: balanceBefore + returnToUser,
        },
      })

      return true
    })
  }

  /**
   * Início do dia atual em BRT (UTC-3), retornado como Date UTC.
   * Usado para idempotência diária da cobrança de juros (CAS em
   * last_interest_charged_at): "hoje BRT" começa às 03:00 UTC.
   */
  static _brtDayStartUtc(now: Date = new Date()): Date {
    // Desloca para BRT, zera hora, devolve o instante UTC correspondente a 00:00 BRT.
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    const y = brt.getUTCFullYear()
    const m = brt.getUTCMonth()
    const d = brt.getUTCDate()
    // 00:00 BRT == 03:00 UTC do mesmo dia civil BRT
    return new Date(Date.UTC(y, m, d, 3, 0, 0, 0))
  }
}

export const leverageService = new LeverageService()
