// ============================================================================
// FootStock Motor — ScheduledOrderRunner
// Executa ordens SCHEDULED no horário programado respeitando sessão de mercado.
// Rastreabilidade: INT-015 / TASK-3/ST003
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import { SessionManager } from './SessionManager'
import { logger } from '../utils/logger'
import { settleOrderFill } from './settlement'
// Zero Silencio (2026-09-02): ordem agendada executava e cancelava so em canal Redis sem
// assinante. Mesmo create compartilhado do OrderExecutor e do OrderMatcher.
import { persistOrderNotification, sideLabel, costLabel } from './orderNotifications'
import type { PrismaOrder } from '../types/prisma.types'
// Fase 3 (2026-09-02): mesma maquina de tentativa/backoff dos outros dois executores.
import { eligibleNowFilter, recordFailedAttempt, cancelExhaustedOrder } from './orderRetry'

export class ScheduledOrderRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly sessionManager: SessionManager,
  ) {}

  /**
   * Verifica e executa ordens SCHEDULED cujo horário chegou.
   * Ordens aguardam sessão TRADING para serem executadas.
   */
  async checkScheduledOrders(currentPrices: Record<string, number>): Promise<void> {
    const now = new Date()
    const session = this.sessionManager.getCurrentSession()

    const orders = await this.prisma.order.findMany({
      where: {
        type: 'SCHEDULED',
        status: 'OPEN',
        scheduledAt: { lte: now },
        // Fase 3: ordem em backoff sai da varredura ate a proxima tentativa.
        // Aqui nao ha `take`, entao nao ha slot a proteger — o ganho e nao repetir
        // a cada 10s uma liquidacao que acabou de falhar.
        ...eligibleNowFilter(now),
      },
      include: { asset: true },
      // scheduledAt continua governando a ordem: e o horario que o usuario pediu.
      // nextAttemptAt entra so como desempate para quem ja falhou.
      orderBy: [{ nextAttemptAt: 'asc' }, { scheduledAt: 'asc' }],
    })

    if (orders.length === 0) return

    // DIVERGENCIA DELIBERADA com acceptsMarketOrders() do web
    // (footstock-next/src/lib/constants/market.ts), que aceita TRADING E
    // CLOSING_CALL. Aqui e so TRADING: ordem agendada dispara sozinha, sem
    // ninguem olhando o book, e a call de fechamento tem volatilidade reduzida
    // (20%) e liquidez rala. Se um dia as duas regras tiverem de convergir, a
    // mudanca e aqui e precisa de decisao de produto — nao e drift acidental.
    if (session !== 'TRADING') {
      logger.info(`[ScheduledOrderRunner] ${orders.length} ordens aguardando sessão TRADING (atual: ${session})`)
      return
    }

    await Promise.allSettled(
      orders.map(async (order: PrismaOrder & { asset: { ticker: string } }) => {
        const price = currentPrices[order.asset.ticker]
        if (price === undefined || price <= 0) {
          logger.warn(`[ScheduledOrderRunner] ticker sem preço: ${order.asset.ticker}`)
          return
        }

        await this._executeScheduled(order, price, now)
      })
    )
  }

  private async _executeScheduled(
    order: PrismaOrder & { asset: { ticker: string } },
    price: number,
    now: Date,
  ): Promise<void> {
    try {
      const executionDelay = order.scheduledAt
        ? now.getTime() - order.scheduledAt.getTime()
        : 0

      const result = await this.prisma.$transaction(
        (tx: Prisma.TransactionClient) => settleOrderFill(tx, order, price),
        { isolationLevel: 'Serializable' },
      )

      if (!result.settled) {
        if (result.reason === 'INSUFFICIENT_BALANCE') {
          logger.warn(`[ScheduledOrderRunner] INSUFFICIENT_BALANCE: ordem agendada ${order.id} cancelada no fill`)
          // A linha duravel vem primeiro e por fora do allSettled: e o unico canal lido.
          // Aqui o aviso importa MAIS que nos outros caminhos — o usuario agendou a ordem
          // e nao estava olhando a tela na hora em que ela foi cancelada.
          await persistOrderNotification(this.prisma, 'ScheduledOrderRunner', {
            userId: order.userId,
            type: 'ORDER_CANCELLED',
            idempotencyKey: `motor:order_cancelled:scheduled_insufficient_balance:${order.id}`,
            title: 'Ordem agendada cancelada: saldo insuficiente',
            body: `Sua ordem agendada de ${sideLabel(order.side)} de ${order.quantity} ${order.asset.ticker} foi cancelada no horário programado porque seu saldo em FS não cobria ${costLabel(order.leverageMultiplier)}. Nenhum valor foi debitado da sua conta.`,
            data: {
              orderId: order.id,
              ticker: order.asset.ticker,
              side: order.side,
              quantity: order.quantity,
              motivo: 'INSUFFICIENT_BALANCE',
              orderType: 'SCHEDULED',
            },
          })
          await Promise.allSettled([
            this.redis.publish(
              `orders:cancelled:${order.userId}`,
              JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, motivo: 'INSUFFICIENT_BALANCE' })
            ),
            this.redis.publish(
              `notifications:${order.userId}`,
              JSON.stringify({
                type: 'ORDER_CANCELLED', orderId: order.id, ticker: order.asset.ticker,
                motivo: 'Saldo insuficiente no momento da execução agendada. Ordem cancelada.',
              })
            ),
          ])
        }
        return
      }

      // ORDEM IMPORTA: linha duravel antes do publish. O publish roda dentro deste try e
      // uma falha de Redis cairia no catch, matando o unico canal com assinante.
      const scheduledFee = result.feeAmount ?? 0
      await persistOrderNotification(this.prisma, 'ScheduledOrderRunner', {
        userId: order.userId,
        type: 'ORDER_EXECUTED',
        idempotencyKey: `motor:order_executed:${order.id}`,
        title: `Ordem agendada executada: ${order.asset.ticker}`,
        body: `Sua ordem agendada de ${sideLabel(order.side)} de ${order.quantity} ${order.asset.ticker} foi executada a ${price.toFixed(2)} FS por unidade. Taxa cobrada: ${scheduledFee.toFixed(2)} FS. Confira o resultado na sua carteira.`,
        data: {
          orderId: order.id,
          ticker: order.asset.ticker,
          side: order.side,
          quantity: order.quantity,
          executedPrice: price,
          fee: scheduledFee,
          orderType: 'SCHEDULED',
          executionDelay,
        },
      })

      await this.redis.publish(
        `orders:executed:${order.userId}`,
        JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, price, executionDelay })
      )

      logger.info(`[ScheduledOrderRunner] OK orderId=${order.id} delay=${executionDelay}ms`)
    } catch (err) {
      logger.error(`[ScheduledOrderRunner] FAIL orderId=${order.id}: ${String(err)}`)

      // Fase 3: este catch nao relanca (nao ha agregado BATCH_FAIL aqui), entao
      // antes a falha sumia no log e a ordem voltava intacta ao proximo tick para
      // sempre. Agora o contador fica na linha e o esgotamento e terminal.
      const outcome = await recordFailedAttempt(this.prisma, 'ScheduledOrderRunner', order, err, new Date())
      if (outcome.exhausted) {
        await cancelExhaustedOrder(this.prisma, 'ScheduledOrderRunner', order, (input) =>
          persistOrderNotification(this.prisma, 'ScheduledOrderRunner', input)
        )
      }
    }
  }
}
