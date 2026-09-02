// ============================================================================
// FootStock Motor — OrderExecutor
// Processa ordens MARKET pendentes a cada tick em batch seguro.
// Rastreabilidade: INT-011 / TASK-2/ST001
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import { settleOrderFill } from './settlement'
import type { PrismaOrder, PrismaDecimal } from '../types/prisma.types'
// describeError/sideLabel/persistOrderNotification moram em orderNotifications.ts desde
// 2026-09-02: LIMIT (OrderMatcher) e SCHEDULED (ScheduledOrderRunner) passaram a gravar a
// mesma linha duravel e nao podem ter uma segunda copia do create nem do formato de log.
import { describeError, sideLabel, costLabel, persistOrderNotification } from './orderNotifications'
import type { OrderNotificationInput } from './orderNotifications'

const BATCH_SIZE = 50

export class OrderExecutor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  /**
   * Processa ordens MARKET pendentes com os preços atuais do tick.
   * Chama TransactionService via HTTP interno ou executa inline (Railway env).
   */
  async processPendingMarketOrders(currentPrices: Record<string, number>): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: { type: 'MARKET', status: 'OPEN' },
      take: BATCH_SIZE,
      include: { asset: true },
      orderBy: { createdAt: 'asc' },
    })

    if (orders.length === 0) return

    const results = await Promise.allSettled(
      orders.map(async (order: PrismaOrder & { asset: { ticker: string; currentPrice: PrismaDecimal; isHalted: boolean } }) => {
        // Rejeitar ordens MARKET em ativos suspensos por circuit breaker / halt admin
        if (order.asset.isHalted) {
          logger.warn(`[OrderExecutor] ASSET_HALTED: cancelando MARKET ordem ${order.id} para ${order.asset.ticker}`)
          await this._cancelHaltedMarketOrder(order)
          return
        }

        const price = currentPrices[order.asset.ticker]
        if (price === undefined || price <= 0) {
          // Zero Silencio: sem orderId/userId o operador ve o ticker repetindo a cada
          // tick e nao consegue achar a ordem presa. Causa tipica: o ativo entrou (ou
          // foi reativado) DEPOIS do boot do motor — MarketEngine.loadAssets() so roda
          // no boot, entao o ticker nunca entra em currentPrices e a ordem fica OPEN
          // ate o cron de expiry. Ordem presa aqui e sinal de reinicio devido.
          logger.warn(
            `[OrderExecutor] skip: ticker sem preço no tick ticker=${order.asset.ticker} orderId=${order.id} userId=${order.userId}`
          )
          return
        }

        await this._executeOrder(order, price)
      })
    )

    // Zero Silencio: a forense precisa saber QUAIS ordens falharam, nao so quantas.
    // results e index-alinhado com orders (Promise.allSettled preserva a ordem) e a
    // lista e limitada por BATCH_SIZE, entao cabe numa unica linha de log.
    const failedOrderIds = results
      .map((result, index) => (result.status === 'rejected' ? orders[index].id : null))
      .filter((id): id is string => id !== null)
    if (failedOrderIds.length > 0) {
      logger.error(
        `[OrderExecutor] BATCH_FAIL failed=${failedOrderIds.length} total=${orders.length} orderIds=${failedOrderIds.join(',')}`
      )
    }
  }

  private async _executeOrder(
    order: PrismaOrder & { asset: { ticker: string; currentPrice: PrismaDecimal } },
    price: number,
  ): Promise<void> {
    try {
      // Liquidação unificada (debit-on-execute) — settlement é a autoridade financeira.
      const result = await this.prisma.$transaction(
        (tx: Prisma.TransactionClient) => settleOrderFill(tx, order, price),
        { isolationLevel: 'Serializable' },
      )

      if (!result.settled) {
        if (result.reason === 'INSUFFICIENT_BALANCE') {
          logger.warn(`[OrderExecutor] INSUFFICIENT_BALANCE: ordem ${order.id} cancelada no fill (${order.asset.ticker})`)
          await Promise.allSettled([
            // Zero Silencio: a linha em `notifications` e a entrega REAL — o front faz
            // polling da tabela (footstock-next useNotifications). Os dois publishes
            // Redis abaixo seguem mantidos, mas hoje nao tem assinante em nenhum ponto
            // do repositorio, entao nao podem ser o unico canal.
            // A tx Serializable ja commitou o status CANCELLED (settlement.ts).
            this._persistOrderNotification({
              userId: order.userId,
              type: 'ORDER_CANCELLED',
              idempotencyKey: `motor:order_cancelled:insufficient_balance:${order.id}`,
              title: 'Ordem cancelada: saldo insuficiente',
              body: `Sua ordem de ${sideLabel(order.side)} de ${order.quantity} ${order.asset.ticker} foi cancelada porque seu saldo em FS não cobria ${costLabel(order.leverageMultiplier)} no momento da execução. Nenhum valor foi debitado da sua conta.`,
              data: {
                orderId: order.id,
                ticker: order.asset.ticker,
                side: order.side,
                quantity: order.quantity,
                motivo: 'INSUFFICIENT_BALANCE',
              },
            }),
            this.redis.publish(
              `orders:cancelled:${order.userId}`,
              JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, motivo: 'INSUFFICIENT_BALANCE' })
            ),
            this.redis.publish(
              `notifications:${order.userId}`,
              JSON.stringify({
                type: 'ORDER_CANCELLED', orderId: order.id, ticker: order.asset.ticker,
                motivo: 'Saldo insuficiente no momento da execução. Ordem cancelada.',
              })
            ),
          ])
        }
        return
      }

      // Pos-commit: o $transaction Serializable acima ja gravou a liquidacao. Este
      // create fica DE PROPOSITO fora da transacao — dentro dela, um conflito de
      // serializacao ou um P2002 na chave idempotente reverteria dinheiro correto.
      // _persistOrderNotification nunca lanca, entao falha aqui nao cai no catch
      // abaixo (que faz rethrow e marcaria a ordem como falha do batch).
      //
      // ORDEM IMPORTA: a linha em `notifications` vem ANTES dos publishes Redis.
      // `redis.publish` roda dentro deste try; um `Connection is closed.` ali fazia
      // rethrow, a ordem entrava no BATCH_FAIL e a notificacao nunca era gravada —
      // o unico canal com assinante (o front faz polling da tabela) morria por causa
      // de um canal que hoje nao tem assinante nenhum no repositorio.
      const fee = result.feeAmount ?? 0
      await this._persistOrderNotification({
        userId: order.userId,
        type: 'ORDER_EXECUTED',
        idempotencyKey: `motor:order_executed:${order.id}`,
        title: `Ordem executada: ${order.asset.ticker}`,
        body: `Sua ordem de ${sideLabel(order.side)} de ${order.quantity} ${order.asset.ticker} foi executada a ${price.toFixed(2)} FS por unidade. Taxa cobrada: ${fee.toFixed(2)} FS. Confira o resultado na sua carteira.`,
        data: {
          orderId: order.id,
          ticker: order.asset.ticker,
          side: order.side,
          quantity: order.quantity,
          executedPrice: price,
          fee,
        },
      })

      // Fire-and-forget, DEPOIS da notificacao duravel: falha de Redis num canal sem
      // assinante nao pode marcar como falha uma ordem ja liquidada e ja notificada.
      // Nao vira silencio: o warn abaixo mantem a falha visivel no log.
      await this.redis
        .publish(
          `orders:executed:${order.userId}`,
          JSON.stringify({
            orderId: order.id, ticker: order.asset.ticker, price,
            quantity: order.quantity, side: order.side,
          })
        )
        .catch((pubErr: unknown) => {
          logger.warn(
            `[OrderExecutor] PUBLISH_FAIL canal=orders:executed orderId=${order.id} ${describeError(pubErr)}`
          )
        })
      await this.redis.incr('motor:metrics:orders_executed').catch(() => {})

      logger.info(`[OrderExecutor] OK orderId=${order.id} ticker=${order.asset.ticker} price=${price} fee=${result.feeAmount}`)
    } catch (err) {
      // Uma unica linha, sem payload multi-linha: o Railway quebrava o dump do
      // Prisma em varios eventos e o code/meta se perdiam (FAILs opacos de 31/08).
      logger.error(
        `[OrderExecutor] FAIL orderId=${order.id} ticker=${order.asset.ticker} userId=${order.userId} ${describeError(err)}`
      )
      throw err
    }
  }

  /**
   * Cancela uma ordem MARKET para ativo suspenso (halt/circuit breaker).
   * debit-on-execute: a ordem NÃO reservou saldo na criação → cancela sem reembolso.
   */
  private async _cancelHaltedMarketOrder(
    order: PrismaOrder & { asset: { ticker: string; currentPrice: PrismaDecimal; isHalted: boolean } }
  ): Promise<void> {
    try {
      // CAS: só cancela se ainda OPEN/PARTIAL (anti-corrida com fill no mesmo tick)
      const claim = await this.prisma.order.updateMany({
        where: { id: order.id, status: { in: ['OPEN', 'PARTIAL'] } },
        data: { status: 'CANCELLED' },
      })
      if (claim.count !== 1) return

      // Zero Silencio: sem esta linha o cliente ve a ordem virar "Cancelada" e nunca
      // descobre que o ativo entrou em circuit breaker. O CAS acima ja garantiu que
      // este caminho roda no maximo uma vez para a ordem.
      //
      // ORDEM IMPORTA: vem ANTES do publish. O publish estava antes e o catch deste
      // metodo engole a excecao — uma falha de Redis cancelava a ordem e nunca
      // gravava o aviso, que e exatamente o silencio que este bloco existe para matar.
      await this._persistOrderNotification({
        userId: order.userId,
        type: 'ORDER_CANCELLED',
        idempotencyKey: `motor:order_cancelled:asset_halted:${order.id}`,
        title: `Ordem cancelada: ${order.asset.ticker} suspenso`,
        body: `Sua ordem de ${sideLabel(order.side)} de ${order.quantity} ${order.asset.ticker} foi cancelada porque a negociação do ativo está suspensa (circuit breaker). Nenhum valor foi debitado. Envie uma nova ordem quando o ativo voltar a negociar.`,
        data: {
          orderId: order.id,
          ticker: order.asset.ticker,
          side: order.side,
          quantity: order.quantity,
          motivo: 'ASSET_HALTED',
        },
      })

      // Fire-and-forget, depois da notificacao duravel (canal sem assinante hoje).
      await this.redis
        .publish(
          `orders:cancelled:${order.userId}`,
          JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, motivo: 'ASSET_HALTED' })
        )
        .catch((pubErr: unknown) => {
          logger.warn(
            `[OrderExecutor] PUBLISH_FAIL canal=orders:cancelled orderId=${order.id} ${describeError(pubErr)}`
          )
        })

      logger.info(`[OrderExecutor] MARKET ordem ${order.id} cancelada por ASSET_HALTED (${order.asset.ticker})`)
    } catch (err) {
      logger.error(`[OrderExecutor] Falha ao cancelar ordem ${order.id} por halt: ${describeError(err)}`)
    }
  }

  /**
   * Persiste a notificacao in-app do evento de ordem deste modulo.
   *
   * Delega para `persistOrderNotification` (engine/orderNotifications.ts), que e a
   * fonte unica do create desde 2026-09-02 — LIMIT/OCO (OrderMatcher) e SCHEDULED
   * (ScheduledOrderRunner) gravam a MESMA linha pelo MESMO caminho. Este wrapper
   * existe so para fixar o prefixo de log do componente.
   *
   * Entrega: a linha no banco E o canal real. O front le a tabela e ja sabe
   * renderizar ORDER_EXECUTED e ORDER_CANCELLED. Os canais Redis de ordem seguem
   * publicando, mas nao tem assinante em nenhum ponto do repositorio.
   *
   * Preferencia do usuario: os DOIS tipos usados aqui estao em ALWAYS_ON_TYPES
   * (footstock-next NotificationRepository), entao nao ha preferencia a consultar —
   * o que este metodo grava e sempre entregue. Se algum dia um tipo NAO always-on
   * for escrito por aqui, o helper compartilhado precisa passar a checar a
   * preferencia, e o motor nao tem o model NotificationPreference no schema raiz.
   *
   * Transacao: SEMPRE chamado FORA da transacao Serializable do fill, com a
   * liquidacao ja commitada. Nunca lanca. Idempotente via indice UNIQUE em
   * idempotency_key — detalhes no docblock do helper.
   */
  private async _persistOrderNotification(input: OrderNotificationInput): Promise<void> {
    return persistOrderNotification(this.prisma, 'OrderExecutor', input)
  }
}
