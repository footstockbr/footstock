// ============================================================================
// FootStock Motor — MarginCallChecker
// Verifica margem de posições SHORT a cada tick e dispara alertas/liquidação.
// Alert: perdas = 50% (restante < 50%) | Liquidação forçada: perdas = 80% (restante < 20%)
// Rastreabilidade: INT-014 / TASK-4/ST003
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import type { PrismaPosition } from '../types/prisma.types'

const MARGIN_ALERT_THRESHOLD = 0.50        // restante < 50% = 50% consumido — alerta (INTAKE canônico)
const MARGIN_LIQUIDATION_THRESHOLD = 0.20  // restante < 20% = 80% consumido — liquidação forçada (INTAKE canônico)
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
      // CAS anti-double-liquidation (06-18) + recompute-in-tx (hardening): reivindica a
      // posicao OPEN->CLOSED de forma ATOMICA e SO entao computa o financeiro a partir de
      // uma RELEITURA transacional (interestAccrued/marginBlocked/avgPrice/quantity podem
      // ter mudado entre o snapshot do checker e agora — ex: cron de juros). claim.count!==1
      // => outro fluxo (buy-to-cover do Next / checker reentrante) ja fechou => no-op (sem
      // double-credit/double-release). Serializable alinha com OrderExecutor/OrderMatcher;
      // em conflito serializavel (P2034) a tx aborta e o proximo tick re-liquida (posicao
      // segue OPEN), entao a liquidacao nao se perde.
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const claim = await tx.position.updateMany({
          where: { id: position.id, status: 'OPEN' },
          data: { status: 'CLOSED' },  // ainda NAO zera quantity: relemos os valores frescos
        })
        if (claim.count !== 1) return null  // ja fechada por fluxo concorrente

        const fresh = await tx.position.findUniqueOrThrow({ where: { id: position.id } })
        const fMarginBlocked = Number(fresh.marginBlocked)
        const fPnl = (Number(fresh.avgPrice) - currentPrice) * fresh.quantity - Number(fresh.interestAccrued)
        const fReturn = fMarginBlocked + fPnl

        const user = await tx.user.findUniqueOrThrow({ where: { id: position.userId } })
        const balanceBefore = Number(user.fsBalance)
        // Guard: saldo nunca negativo — perda além da margem é registrada como loss absorvida
        const newBalance = Math.max(0, balanceBefore + fReturn)
        const newMarginBlocked = Math.max(0, Number(user.marginBlocked) - fMarginBlocked)

        await tx.user.update({
          where: { id: position.userId },
          data: { fsBalance: newBalance, marginBlocked: newMarginBlocked },
        })
        await tx.position.update({ where: { id: position.id }, data: { quantity: 0 } })
        await tx.transaction.create({
          data: {
            userId: position.userId,
            assetId: position.assetId,
            type: 'MARKET',
            financialType: 'SHORT_CLOSE',
            side: 'BUY',
            quantity: fresh.quantity,
            price: currentPrice,
            fee: 0,
            totalAmount: Math.abs(fReturn),
            fsAmount: fReturn,
            balanceBefore,
            balanceAfter: newBalance,
          },
        })
        return { pnl: fPnl }
      }, { isolationLevel: 'Serializable' })

      if (result === null) {
        logger.info(
          `[MarginCallChecker] liquidacao ignorada: posicao ${position.id} ja fechada por fluxo concorrente`
        )
        return
      }
      const pnl = result.pnl

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
