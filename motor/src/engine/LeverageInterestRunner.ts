// ============================================================================
// Foot Stock Motor — LeverageInterestRunner
// Cobra juros diários de posições LONG alavancadas (leverage=2).
//
// INTAKE: alavancagem 2x exclusiva do plano Lenda.
// Taxa: 0.3%/dia sobre o valor alavancado (leverageAmount).
// Fluxo: FECHADO → chargeDaily() → acumula interestAccrued → debita saldo.
// Liquidação forçada: posição encerrada se saldo insuficiente para cobrir juros.
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'

const DAILY_INTEREST_RATE = 0.003  // 0.3%/dia sobre o leverageAmount (INTAKE)
const REDIS_LAST_CHARGE_KEY = 'motor:leverage:last_charge_date'

export class LeverageInterestRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  /**
   * Cobra juros diários de todas as posições LONG alavancadas abertas.
   * Idempotente — usa Redis para garantir cobrança única por dia (YYYY-MM-DD BRT).
   */
  async chargeDaily(): Promise<void> {
    const today = this._todayBRT()
    const lastCharge = await this.redis.get(REDIS_LAST_CHARGE_KEY).catch(() => null)

    if (lastCharge === today) {
      logger.debug('[LeverageInterest] Juros já cobrados hoje, skip.')
      return
    }

    const positions = await this.prisma.position.findMany({
      where: {
        side: 'LONG',
        status: 'OPEN',
        leverageMultiplier: { gt: 1 },
      },
    })

    if (positions.length === 0) {
      await this._markCharged(today)
      return
    }

    logger.info(`[LeverageInterest] Cobrando juros de ${positions.length} posições alavancadas (${today})`)

    const results = await Promise.allSettled(
      positions.map((pos: { id: string; userId: string; leverageAmount: unknown; interestAccrued: unknown; quantity: number; avgPrice: unknown }) => this._chargePosition(pos as Parameters<typeof this._chargePosition>[0], today))
    )

    const failed = results.filter(r => r.status === 'rejected').length
    if (failed > 0) {
      logger.error(`[LeverageInterest] ${failed} posições falharam na cobrança`)
    }

    await this._markCharged(today)
    logger.info(`[LeverageInterest] Cobrança concluída (${positions.length - failed} ok, ${failed} falhas)`)
  }

  private async _chargePosition(
    position: { id: string; userId: string; leverageAmount: any; interestAccrued: any; quantity: number; avgPrice: any },
    today: string,
  ): Promise<void> {
    const leverageAmount = Number(position.leverageAmount)
    if (leverageAmount <= 0) return

    const dailyInterest = leverageAmount * DAILY_INTEREST_RATE

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: position.userId } })
      const currentBalance = Number(user.fsBalance)

      if (currentBalance >= dailyInterest) {
        // Cobrar juros normalmente
        await tx.user.update({
          where: { id: position.userId },
          data: { fsBalance: { decrement: dailyInterest } },
        })
        await tx.position.update({
          where: { id: position.id },
          data: { interestAccrued: { increment: dailyInterest } },
        })

        // Notificar cobrança de juros
        await this.redis.publish(
          `notifications:${position.userId}`,
          JSON.stringify({
            type: 'LEVERAGE_INTEREST_CHARGED',
            positionId: position.id,
            interest: dailyInterest.toFixed(2),
            rate: `${(DAILY_INTEREST_RATE * 100).toFixed(1)}%`,
            message: `Juros de alavancagem cobrados: FS$ ${dailyInterest.toFixed(2)}`,
            date: today,
          })
        ).catch(() => {})
      } else {
        // Saldo insuficiente → liquidar posição forçadamente
        const interestAccrued = Number(position.interestAccrued) + dailyInterest
        const totalInvested = Number(position.avgPrice) * position.quantity

        // Devolver capital restante (totalInvested - leverageAmount - juros acumulados)
        const returnAmount = Math.max(0, totalInvested - leverageAmount - interestAccrued)

        await tx.position.update({
          where: { id: position.id },
          data: { status: 'CLOSED', quantity: 0, interestAccrued },
        })

        if (returnAmount > 0) {
          await tx.user.update({
            where: { id: position.userId },
            data: { fsBalance: { increment: returnAmount } },
          })
        }

        await this.redis.publish(
          `notifications:${position.userId}`,
          JSON.stringify({
            type: 'LEVERAGE_LIQUIDATION',
            code: 'POS_051',
            positionId: position.id,
            message: `Posição alavancada encerrada: saldo insuficiente para cobrir juros diários de FS$ ${dailyInterest.toFixed(2)}.`,
            returnAmount: returnAmount.toFixed(2),
            date: today,
          })
        ).catch(() => {})

        logger.warn(
          `[LeverageInterest] LIQUIDAÇÃO positionId=${position.id} ` +
          `juros=${dailyInterest.toFixed(2)} saldo=${currentBalance.toFixed(2)}`
        )
      }
    })
  }

  private _todayBRT(): string {
    // BRT = UTC-3
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
    return now.toISOString().slice(0, 10)
  }

  private async _markCharged(date: string): Promise<void> {
    // TTL = 25h para garantir cobertura além de 1 dia (evita race conditions de meia-noite)
    await this.redis.setex(REDIS_LAST_CHARGE_KEY, 25 * 3600, date).catch(() => {})
  }
}
