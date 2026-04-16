// ============================================================================
// FootStock — Job: expiração de ordens LIMIT/OCO/SCHEDULED após 30 dias
// Executado diariamente às 00:05 BRT pelo scheduler (lib/jobs/scheduler.ts).
// Rastreabilidade: INT-012, INT-013 / TASK-3/ST004
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { ORDER_STATUS } from '@/lib/enums'
import { validateTransition } from '@/lib/contracts/order-contract'

const EXPIRY_DAYS = 30

export interface ExpiryResult {
  expired: number
  processedAt: Date
  tickers: string[]
}

export async function processExpiredOrders(): Promise<ExpiryResult> {
  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() - EXPIRY_DAYS)

  const expiredOrders = await prisma.order.findMany({
    where: {
      status: ORDER_STATUS.OPEN,
      type: { in: ['LIMIT', 'OCO', 'SCHEDULED'] },
      createdAt: { lt: expiryDate },
    },
    include: { asset: true },
  })

  if (expiredOrders.length === 0) {
    return { expired: 0, processedAt: new Date(), tickers: [] }
  }

  let expiredCount = 0
  const tickers: string[] = []
  const processedGroupIds = new Set<string>()

  for (const order of expiredOrders) {
    try {
      if (order.groupId && processedGroupIds.has(order.groupId)) continue

      validateTransition(order.status as import('@/lib/enums').OrderStatus, ORDER_STATUS.EXPIRED, order.id)

      if (order.type === 'OCO' && order.groupId) {
        // Expirar ambas as pernas do par OCO na mesma transaction
        await prisma.$transaction(async (tx) => {
          await tx.order.updateMany({
            where: { groupId: order.groupId!, status: ORDER_STATUS.OPEN },
            data: { status: 'EXPIRED' },
          })
        })

        const legs = await prisma.order.findMany({ where: { groupId: order.groupId } })
        for (const leg of legs) {
          await redis.publish(
            `notifications:${leg.userId}`,
            JSON.stringify({
              type: 'ORDER_CANCELLED',
              orderId: leg.id,
              ticker: order.asset.ticker,
              motivo: 'Ordem expirada após 30 dias',
              status: ORDER_STATUS.EXPIRED,
            })
          ).catch(() => {})
        }
        expiredCount += legs.length
        processedGroupIds.add(order.groupId)
      } else {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'EXPIRED' },
        })
        await redis.publish(
          `notifications:${order.userId}`,
          JSON.stringify({
            type: 'ORDER_CANCELLED',
            orderId: order.id,
            ticker: order.asset.ticker,
            motivo: 'Ordem expirada após 30 dias',
            status: ORDER_STATUS.EXPIRED,
          })
        ).catch(() => {})
        expiredCount++
      }

      if (!tickers.includes(order.asset.ticker)) tickers.push(order.asset.ticker)
    } catch (err) {
      console.error(`[order-expiry] Falha ao expirar ordem ${order.id}:`, err)
    }
  }

  await redis.incr('motor:metrics:orders_expired').catch(() => {})

  const result: ExpiryResult = { expired: expiredCount, processedAt: new Date(), tickers }
  console.info(`[order-expiry] ${JSON.stringify(result)}`)
  return result
}

export default processExpiredOrders
