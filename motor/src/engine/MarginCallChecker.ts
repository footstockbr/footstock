// ============================================================================
// Foot Stock Motor — MarginCallChecker
// Verifica margem de posições SHORT a cada tick e dispara alertas/liquidação.
// Alert: margem restante = 50% | Liquidação forçada: perdas > 80% (restante < 20%)
// Rastreabilidade: INT-014 / TASK-4/ST003
// ============================================================================

import { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import type { PrismaPosition } from '../types/prisma.types'

const MARGIN_ALERT_THRESHOLD = 0.50    // 50%: alerta de margin call (INTAKE canônico)
const MARGIN_LIQUIDATION_THRESHOLD = 0.20  // 20%: liquidação forçada — perdas > 80% (INTAKE canônico)
const ALERT_THROTTLE_TTL_SECONDS = 3600   // 1h entre alertas para a mesma posição

export class MarginCallChecker {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  /**
   * Verifica todas as posições SHORT abertas e toma ação conforme ratio de margem.
   * Chamado a cada tick pelo MarketEngine.
   */
  async checkMarginCalls(currentPrices: Record<string, number>): Promise<void> {
    const positions = await this.prisma.position.findMany({
      where: { side: 'SHORT', status: 'OPEN' },
      include: { asset: { select: { ticker: true } } },
    })

    if (positions.length === 0) return

    await Promise.allSettled(
      positions.map(async (position: PrismaPosition & { asset: { ticker: string } }) => {
        const currentPrice = currentPrices[position.asset.ticker]
        if (currentPrice === undefined || currentPrice <= 0) return

        await this._evaluatePosition(position, currentPrice)
      })
    )
  }

  private async _evaluatePosition(
    position: PrismaPosition & { asset: { ticker: string } },
    currentPrice: number,
  ): Promise<void> {
    const marginBlocked = Number(position.marginBlocked)
    if (marginBlocked <= 0) return

    // Valor de mercado atual da posição (quanto custaria recomprar)
    const marketValue = position.quantity * currentPrice

    // Ratio = marginBlocked / (marginBlocked + unrealizedLoss)
    // Perda não realizada: quando currentPrice > avgPrice (short perdendo)
    const avgPrice = Number(position.avgPrice)
    const unrealizedLoss = Math.max(0, (currentPrice - avgPrice) * position.quantity)
    const effectiveMargin = marginBlocked - unrealizedLoss

    const marginRatio = marginBlocked > 0 ? effectiveMargin / marginBlocked : 1

    if (marginRatio < MARGIN_LIQUIDATION_THRESHOLD) {
      await this._forceLiquidation(position, currentPrice, marginRatio)
    } else if (marginRatio < MARGIN_ALERT_THRESHOLD) {
      await this._sendMarginAlert(position, marginRatio, effectiveMargin, marketValue)
    }
  }

  private async _forceLiquidation(
    position: PrismaPosition & { asset: { ticker: string } },
    currentPrice: number,
    marginRatio: number,
  ): Promise<void> {
    try {
      const interestAccrued = Number(position.interestAccrued)
      const marginBlocked = Number(position.marginBlocked)
      const avgPrice = Number(position.avgPrice)

      // P&L negativo (forçado)
      const pnl = (avgPrice - currentPrice) * position.quantity - interestAccrued
      const returnAmount = marginBlocked + pnl

      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: position.userId } })

        const balanceBefore = Number(user.fsBalance)
        // Guard: saldo nunca negativo — perda além da margem é registrada como loss absorvida
        const newBalance = Math.max(0, balanceBefore + returnAmount)
        const newMarginBlocked = Math.max(0, Number(user.marginBlocked) - marginBlocked)

        await tx.user.update({
          where: { id: position.userId },
          data: { fsBalance: newBalance, marginBlocked: newMarginBlocked },
        })

        await tx.position.update({
          where: { id: position.id },
          data: { status: 'CLOSED', quantity: 0 },
        })

        await tx.transaction.create({
          data: {
            userId: position.userId,
            assetId: position.assetId,
            type: 'MARKET',
            financialType: 'SHORT_CLOSE',
            side: 'BUY',
            quantity: position.quantity,
            price: currentPrice,
            fee: 0,
            totalAmount: Math.abs(returnAmount),
            fsAmount: returnAmount,
            balanceBefore,
            balanceAfter: newBalance,
          },
        })
      })

      // Notificar usuário da liquidação forçada + canal margin:call
      await Promise.allSettled([
        this.redis.publish(
          `notifications:${position.userId}`,
          JSON.stringify({
            type: 'FORCED_LIQUIDATION',
            code: 'POS_050',
            positionId: position.id,
            ticker: position.asset.ticker,
            marginRatio: (marginRatio * 100).toFixed(1),
            pnl,
            message: `Posição SHORT liquidada forçadamente. Margem abaixo de ${(MARGIN_LIQUIDATION_THRESHOLD * 100).toFixed(0)}%.`,
          })
        ),
        this.redis.publish(
          `margin:call:${position.userId}`,
          JSON.stringify({
            type: 'FORCED_LIQUIDATION',
            code: 'POS_050',
            positionId: position.id,
            ticker: position.asset.ticker,
            marginRatio: (marginRatio * 100).toFixed(1),
          })
        ),
      ])

      // Incrementar métrica
      await this.redis.incr('motor:metrics:forced_liquidations').catch(() => {})

      logger.warn(
        `[MarginCallChecker] LIQUIDAÇÃO FORÇADA positionId=${position.id} ` +
        `ticker=${position.asset.ticker} marginRatio=${(marginRatio * 100).toFixed(1)}% pnl=${pnl.toFixed(2)}`
      )
    } catch (err) {
      logger.error(`[MarginCallChecker] Falha na liquidação forçada positionId=${position.id}: ${String(err)}`)
    }
  }

  private async _sendMarginAlert(
    position: PrismaPosition & { asset: { ticker: string } },
    marginRatio: number,
    effectiveMargin: number,
    marketValue: number,
  ): Promise<void> {
    // Throttle: só alerta 1x por hora por posição
    const throttleKey = `motor:margin_alert:${position.id}`
    const alreadyAlerted = await this.redis.get(throttleKey)
    if (alreadyAlerted) return

    await this.redis.setex(throttleKey, ALERT_THROTTLE_TTL_SECONDS, '1')

    await Promise.allSettled([
      this.redis.publish(
        `notifications:${position.userId}`,
        JSON.stringify({
          type: 'MARGIN_CALL_WARNING',
          positionId: position.id,
          ticker: position.asset.ticker,
          marginRatio: (marginRatio * 100).toFixed(1),
          effectiveMargin: effectiveMargin.toFixed(2),
          marketValue: marketValue.toFixed(2),
          liquidationThreshold: (MARGIN_LIQUIDATION_THRESHOLD * 100).toFixed(0),
          message: `Atenção! Margem do short ${position.asset.ticker} em ${(marginRatio * 100).toFixed(1)}%. Risco de liquidação forçada.`,
        })
      ),
      this.redis.publish(
        `margin:call:${position.userId}`,
        JSON.stringify({
          type: 'MARGIN_CALL_WARNING',
          positionId: position.id,
          ticker: position.asset.ticker,
          marginRatio: (marginRatio * 100).toFixed(1),
        })
      ),
    ])

    logger.warn(
      `[MarginCallChecker] MARGIN CALL positionId=${position.id} ` +
      `ticker=${position.asset.ticker} marginRatio=${(marginRatio * 100).toFixed(1)}%`
    )
  }
}
