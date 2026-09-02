// ============================================================================
// FootStock Motor — OrderMatcher
// Verifica ordens LIMIT e OCO a cada tick e executa quando condições atingidas.
// Rastreabilidade: INT-012, INT-013 / TASK-3
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import { settleOrderFill } from './settlement'
// Zero Silencio (2026-09-02): LIMIT e OCO executavam e cancelavam publicando SO em canais
// Redis que nao tem assinante nenhum no repositorio. O front le a TABELA `notifications`
// por polling — a consulta de producao de 02/09 nao achou uma unica linha de
// ORDER_EXECUTED/ORDER_CANCELLED desde 20/04. O create mora no modulo compartilhado.
import { persistOrderNotification, sideLabel, costLabel } from './orderNotifications'
import type { PrismaOrder } from '../types/prisma.types'
// Fase 3 (2026-09-02): mesma classificacao de erro, mesmo orcamento de tentativas e
// mesmo cancelamento terminal que MARKET e SCHEDULED usam.
import {
  eligibleNowFilter,
  RETRY_ORDER_BY,
  recordFailedAttempt,
  cancelExhaustedOrder,
} from './orderRetry'

const BATCH_SIZE = 100

export class OrderMatcher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  /**
   * Verifica ordens LIMIT e OCO pendentes a cada tick.
   * Executa quando o preço-alvo é atingido (com price improvement).
   */
  async checkLimitOrders(currentPrices: Record<string, number>): Promise<void> {
    // Fase 3: elegibilidade decidida na query (ver orderRetry.eligibleNowFilter).
    const now = new Date()
    const orders = await this.prisma.order.findMany({
      where: { type: { in: ['LIMIT', 'OCO'] }, status: 'OPEN', ...eligibleNowFilter(now) },
      take: BATCH_SIZE,
      include: { asset: true },
      orderBy: RETRY_ORDER_BY,
    })

    if (orders.length === 0) return

    await Promise.allSettled(
      orders.map(async (order: PrismaOrder & { asset: { ticker: string } }) => {
        const currentPrice = currentPrices[order.asset.ticker]
        if (currentPrice === undefined) return

        const limitPrice = order.price ? Number(order.price) : null
        if (limitPrice === null) return

        if (order.type === 'LIMIT') {
          await this._checkLimitTrigger(order, currentPrice, limitPrice)
        } else if (order.type === 'OCO') {
          await this._checkOcoTrigger(order, currentPrice)
        }
      })
    )
  }

  private async _checkLimitTrigger(
    order: PrismaOrder & { asset: { ticker: string } },
    currentPrice: number,
    limitPrice: number,
  ): Promise<void> {
    const shouldExecute =
      (order.side === 'BUY' && currentPrice <= limitPrice) ||
      (order.side === 'SELL' && currentPrice >= limitPrice)

    if (!shouldExecute) return

    const priceImprovement = order.side === 'BUY' ? limitPrice - currentPrice : currentPrice - limitPrice

    logger.info(
      `[OrderMatcher] LIMIT ${order.side} orderId=${order.id} ` +
      `limitPrice=${limitPrice} executionPrice=${currentPrice} improvement=${priceImprovement.toFixed(4)}`
    )

    await this._executeLimitOrder(order, currentPrice)
  }

  private async _checkOcoTrigger(
    order: PrismaOrder & { asset: { ticker: string } },
    currentPrice: number,
  ): Promise<void> {
    if (!order.groupId) return

    // Os campos stopLossPrice e takeProfitPrice estão em metadata (usamos price para take-profit)
    // OCO perna take-profit: side=SELL, type=OCO, price=takeProfitPrice
    // OCO perna stop-loss: side=SELL, type=OCO, price=stopLossPrice (identificado por ser o menor)
    // Buscar par OCO
    const pair = await this.prisma.order.findMany({
      where: { groupId: order.groupId, status: 'OPEN', type: 'OCO' },
      include: { asset: true },
    })

    if (pair.length < 2) {
      // Uma perna já foi processada
      return
    }

    // Determinar pernas por preço (menor = stop-loss, maior = take-profit)
    const prices = pair.map((p: PrismaOrder & { asset: { ticker: string } }) => Number(p.price ?? 0))
    const stopLossOrder = pair[prices.indexOf(Math.min(...prices))]
    const takeProfitOrder = pair[prices.indexOf(Math.max(...prices))]

    // Verificar take-profit (preço subiu acima)
    if (currentPrice >= Number(takeProfitOrder.price)) {
      await this._executeOcoLeg(takeProfitOrder, stopLossOrder, currentPrice, 'Take Profit executado (OCO)')
      return
    }

    // Verificar stop-loss (preço caiu abaixo)
    if (currentPrice <= Number(stopLossOrder.price)) {
      await this._executeOcoLeg(stopLossOrder, takeProfitOrder, currentPrice, 'Stop Loss executado (OCO)')
    }
  }

  private async _executeLimitOrder(
    order: PrismaOrder & { asset: { ticker: string } },
    executionPrice: number,
  ): Promise<void> {
    try {
      const result = await this.prisma.$transaction(
        (tx: Prisma.TransactionClient) => settleOrderFill(tx, order, executionPrice),
        { isolationLevel: 'Serializable' },
      )

      if (!result.settled) {
        if (result.reason === 'INSUFFICIENT_BALANCE') {
          await this._notifyCancelled(
            order,
            'Saldo insuficiente no momento da execução LIMIT. Ordem cancelada.',
            `Sua ordem limite de ${sideLabel(order.side)} de ${order.quantity} ${order.asset.ticker} foi cancelada porque seu saldo em FS não cobria ${costLabel(order.leverageMultiplier)} quando o preço atingiu o limite. Nenhum valor foi debitado da sua conta.`,
            `motor:order_cancelled:limit_insufficient_balance:${order.id}`,
            'INSUFFICIENT_BALANCE',
          )
        }
        return
      }

      // ORDEM IMPORTA: a linha duravel vem ANTES do publish. `redis.publish` roda dentro
      // deste try e um `Connection is closed.` ali cairia no catch — o unico canal com
      // assinante morreria por causa de um canal que nao tem nenhum.
      const limitFee = result.feeAmount ?? 0
      await persistOrderNotification(this.prisma, 'OrderMatcher', {
        userId: order.userId,
        type: 'ORDER_EXECUTED',
        idempotencyKey: `motor:order_executed:${order.id}`,
        title: `Ordem executada: ${order.asset.ticker}`,
        body: `Sua ordem limite de ${sideLabel(order.side)} de ${order.quantity} ${order.asset.ticker} foi executada a ${executionPrice.toFixed(2)} FS por unidade. Taxa cobrada: ${limitFee.toFixed(2)} FS. Confira o resultado na sua carteira.`,
        data: {
          orderId: order.id,
          ticker: order.asset.ticker,
          side: order.side,
          quantity: order.quantity,
          executedPrice: executionPrice,
          fee: limitFee,
          orderType: 'LIMIT',
        },
      })

      await this.redis.publish(
        `orders:executed:${order.userId}`,
        JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, price: executionPrice })
      )
      logger.info(`[OrderMatcher] LIMIT OK orderId=${order.id} ticker=${order.asset.ticker} price=${executionPrice}`)
    } catch (err) {
      logger.error(`[OrderMatcher] LIMIT fail orderId=${order.id}: ${String(err)}`)
      await this._accountFailedAttempt(order, err)
    }
  }

  private async _executeOcoLeg(
    executedLeg: PrismaOrder & { asset: { ticker: string } },
    cancelledLeg: PrismaOrder & { asset: { ticker: string } },
    executionPrice: number,
    reason: string,
  ): Promise<void> {
    try {
      // Settlement da perna disparada + cancelamento de TODAS as outras pernas do
      // grupo na MESMA transação (atômico, anti-corrida entre ticks).
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const r = await settleOrderFill(tx, executedLeg, executionPrice)
        if (!r.settled) return r
        if (executedLeg.groupId) {
          await tx.order.updateMany({
            where: {
              groupId: executedLeg.groupId,
              id: { not: executedLeg.id },
              status: { in: ['OPEN', 'PARTIAL'] },
            },
            // Fase 3: a perna irma passa a carregar o motivo. Sem isso o historico
            // mostraria "Cancelada" sem dizer que foi a irma que executou.
            data: { status: 'CANCELLED', cancelReason: 'OCO_SIBLING', nextAttemptAt: null },
          })
        }
        return r
      }, { isolationLevel: 'Serializable' })

      if (!result.settled) {
        if (result.reason === 'INSUFFICIENT_BALANCE') {
          await this._notifyCancelled(
            executedLeg,
            'Saldo insuficiente ao disparar OCO. Ordem cancelada.',
            `Sua ordem OCO de ${sideLabel(executedLeg.side)} de ${executedLeg.quantity} ${executedLeg.asset.ticker} foi disparada, mas cancelada porque seu saldo em FS não cobria ${costLabel(executedLeg.leverageMultiplier)}. Nenhum valor foi debitado da sua conta.`,
            `motor:order_cancelled:oco_insufficient_balance:${executedLeg.id}`,
            'INSUFFICIENT_BALANCE',
          )
        }
        return
      }

      // As duas linhas duraveis (perna executada + perna irma cancelada) vem ANTES dos
      // publishes, pelo mesmo motivo do caminho LIMIT. `persistOrderNotification` nunca
      // lanca, entao nenhuma delas pode derrubar a outra nem cair no catch.
      const ocoFee = result.feeAmount ?? 0
      const rawCancelledPrice = cancelledLeg.price == null ? null : Number(cancelledLeg.price)
      const cancelledLegPrice =
        rawCancelledPrice != null && Number.isFinite(rawCancelledPrice) ? rawCancelledPrice : null
      await persistOrderNotification(this.prisma, 'OrderMatcher', {
        userId: executedLeg.userId,
        type: 'ORDER_EXECUTED',
        idempotencyKey: `motor:order_executed:${executedLeg.id}`,
        title: `Ordem executada: ${executedLeg.asset.ticker}`,
        body: `${reason}. Sua ordem de ${sideLabel(executedLeg.side)} de ${executedLeg.quantity} ${executedLeg.asset.ticker} foi executada a ${executionPrice.toFixed(2)} FS por unidade. Taxa cobrada: ${ocoFee.toFixed(2)} FS.`,
        data: {
          orderId: executedLeg.id,
          ticker: executedLeg.asset.ticker,
          side: executedLeg.side,
          quantity: executedLeg.quantity,
          executedPrice: executionPrice,
          fee: ocoFee,
          orderType: 'OCO',
          motivo: reason,
        },
      })

      // A perna irma foi cancelada pelo updateMany DENTRO da transacao acima — este e o
      // cancelamento que o usuario mais precisa ver: ele nao pediu, o par pediu por ele.
      //
      // ACOPLAMENTO (2026-09-02): o updateMany cancela TODAS as outras pernas vivas do
      // grupo, e este aviso cobre so `cancelledLeg`. Hoje as duas coisas coincidem porque
      // um grupo OCO tem exatamente duas pernas — `OrderService.createOrder` cria stop-loss
      // e take-profit numa unica transaction sob um `randomUUID()` novo, e nenhum outro
      // ponto do produto escreve `order.groupId`. Se algum dia um grupo puder ter tres ou
      // mais pernas, `_checkOcoTrigger` (que escolhe duas por min/max de preco) e este
      // aviso passam a ignorar as demais, e a terceira perna seria cancelada em silencio —
      // exatamente o defeito que esta correcao veio matar. Nesse dia, notificar a lista
      // que o updateMany devolve, lendo-a dentro da transaction como faz o job de
      // expiracao (`footstock-next/src/lib/jobs/order-expiry.ts`).
      await persistOrderNotification(this.prisma, 'OrderMatcher', {
        userId: cancelledLeg.userId,
        type: 'ORDER_CANCELLED',
        idempotencyKey: `motor:order_cancelled:oco_pair:${cancelledLeg.id}`,
        title: 'Ordem cancelada: par OCO',
        // O preco entra porque e o UNICO campo que diferencia as duas pernas: elas
        // compartilham side, quantity e ticker (OrderService.createOrder). Sem ele o
        // usuario le "a outra perna de venda de 50 URU3" sem saber qual das duas era.
        body: `${reason}. A outra perna do par (${sideLabel(cancelledLeg.side)} de ${cancelledLeg.quantity} ${cancelledLeg.asset.ticker}${cancelledLegPrice != null ? ` a ${cancelledLegPrice.toFixed(2)} FS` : ''}) foi cancelada automaticamente, como previsto na ordem OCO. Nenhum valor foi debitado por ela.`,
        data: {
          orderId: cancelledLeg.id,
          ticker: cancelledLeg.asset.ticker,
          side: cancelledLeg.side,
          quantity: cancelledLeg.quantity,
          orderType: 'OCO',
          motivo: reason,
          triggeredBy: executedLeg.id,
        },
      })

      await Promise.allSettled([
        this.redis.publish(
          `orders:executed:${executedLeg.userId}`,
          JSON.stringify({ orderId: executedLeg.id, ticker: executedLeg.asset.ticker, price: executionPrice })
        ),
        this.redis.publish(
          `orders:cancelled:${executedLeg.userId}`,
          JSON.stringify({ orderId: cancelledLeg.id, motivo: reason })
        ),
        this.redis.publish(
          `notifications:${executedLeg.userId}`,
          JSON.stringify({ type: 'ORDER_CANCELLED', orderId: cancelledLeg.id, motivo: reason })
        ),
      ])

      logger.info(`[OrderMatcher] OCO executado: ${executedLeg.id} (${reason}), grupo ${executedLeg.groupId} cancelado`)
    } catch (err) {
      logger.error(`[OrderMatcher] OCO fail orderId=${executedLeg.id}: ${String(err)}`)
      await this._accountFailedAttempt(executedLeg, err)
    }
  }

  /**
   * Contabiliza a falha de liquidacao na propria ordem e, se o orcamento acabou,
   * cancela terminalmente com motivo.
   *
   * Diferente do OrderExecutor, os catches deste modulo NAO relancam — nao existe
   * agregado BATCH_FAIL para LIMIT/OCO. Antes da Fase 3 isso significava que a
   * falha inesperada sumia no log e a ordem voltava intacta ao lote no proximo
   * tick, para sempre. Agora o contador fica na linha, entao a falha e visivel
   * tanto no historico da ordem quanto no relatorio de reconciliacao.
   */
  private async _accountFailedAttempt(
    order: PrismaOrder & { asset: { ticker: string } },
    err: unknown,
  ): Promise<void> {
    const outcome = await recordFailedAttempt(this.prisma, 'OrderMatcher', order, err, new Date())
    if (!outcome.exhausted) return
    await cancelExhaustedOrder(this.prisma, 'OrderMatcher', order, (input) =>
      persistOrderNotification(this.prisma, 'OrderMatcher', input)
    )
  }

  /**
   * Cancelamento por falha de liquidacao (saldo insuficiente).
   *
   * A linha duravel vem PRIMEIRO e por fora do Promise.allSettled: e o unico canal que
   * o usuario le. Os dois publishes seguem mantidos para nao quebrar um assinante
   * futuro, mas hoje nao tem nenhum. `persistOrderNotification` nunca lanca.
   *
   * A transacao Serializable ja commitou o status CANCELLED (settlement.ts) quando este
   * metodo roda — nenhuma escrita daqui pode reverter liquidacao.
   */
  private async _notifyCancelled(
    order: PrismaOrder & { asset: { ticker: string } },
    motivo: string,
    body: string,
    idempotencyKey: string,
    motivoCode: string,
  ): Promise<void> {
    await persistOrderNotification(this.prisma, 'OrderMatcher', {
      userId: order.userId,
      type: 'ORDER_CANCELLED',
      idempotencyKey,
      title: 'Ordem cancelada: saldo insuficiente',
      body,
      data: {
        orderId: order.id,
        ticker: order.asset.ticker,
        side: order.side,
        quantity: order.quantity,
        motivo: motivoCode,
      },
    })

    await Promise.allSettled([
      this.redis.publish(
        `orders:cancelled:${order.userId}`,
        JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, motivo })
      ),
      this.redis.publish(
        `notifications:${order.userId}`,
        JSON.stringify({ type: 'ORDER_CANCELLED', orderId: order.id, ticker: order.asset.ticker, motivo })
      ),
    ])
  }
}
