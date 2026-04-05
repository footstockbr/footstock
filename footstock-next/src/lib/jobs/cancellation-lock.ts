// ============================================================================
// Foot Stock — Job: cancellation-lock
// Cron a cada 30min: processa travas de cancelamento expiradas
// Executa venda compulsória via ShortService + OrderService
// Idempotente: verifica status=CANCELLATION_LOCK antes de processar
// ============================================================================

import { prisma } from '@/lib/prisma'
import { shortService } from '@/lib/services/ShortService'
import { orderService } from '@/lib/services/OrderService'
import { NotificationStub } from '@/lib/notifications/stubs/NotificationStub'
import type { ProcessResult } from './subscription-expiry'

interface PendingPosition {
  id: string
  ativo: string
  tipo: 'SHORT' | 'LONG'
  quantidade: number
  currentPrice: number
}

/** Busca posições SHORT e ordens OCO pendentes que precisam ser liquidadas */
async function checkPendingPositions(userId: string): Promise<PendingPosition[]> {
  const positions = await prisma.position.findMany({
    where: { userId, status: 'OPEN', side: 'SHORT' },
    include: { asset: { select: { ticker: true, currentPrice: true } } },
  })

  return positions.map((p) => ({
    id: p.id,
    ativo: p.asset.ticker,
    tipo: 'SHORT' as const,
    quantidade: Number(p.quantity),
    currentPrice: Number(p.asset.currentPrice),
  }))
}

/** Liquida posições SHORT e cancela ordens OCO pendentes */
async function liquidatePositions(userId: string, positions: PendingPosition[]): Promise<{ totalValue: number }> {
  let totalValue = 0

  // Fechar todas as posições SHORT
  for (const pos of positions) {
    try {
      const { pnl } = await shortService.closeShort(userId, pos.id, pos.currentPrice, 'COMPULSORY_LIQUIDATION')
      totalValue += pos.quantidade * pos.currentPrice + pnl
    } catch (err) {
      console.error(`[cancellation-lock] Falha ao liquidar SHORT ${pos.id}:`, err)
    }
  }

  // Cancelar ordens OCO pendentes
  try {
    const pendingOrders = await prisma.order.findMany({
      where: { userId, status: { in: ['OPEN', 'PARTIAL'] }, type: { in: ['OCO', 'SCHEDULED'] } },
      select: { id: true },
    })
    for (const order of pendingOrders) {
      try {
        await orderService.cancelOrder(userId, order.id)
      } catch (err) {
        console.error(`[cancellation-lock] Falha ao cancelar ordem ${order.id}:`, err)
      }
    }
  } catch (err) {
    console.error(`[cancellation-lock] Falha ao buscar ordens pendentes:`, err)
  }

  return { totalValue }
}

/** Processa travas de cancelamento expiradas e executa venda compulsória se necessário */
export async function processCancellationLocks(): Promise<ProcessResult> {
  const now = new Date()
  const result: ProcessResult = { processed: 0, errors: 0, details: [] }

  const expired = await prisma.subscription.findMany({
    where: {
      status: 'CANCELLATION_LOCK',
      cancellationLockExpiresAt: { lte: now },
    },
    select: { id: true, userId: true, planType: true, cancellationLockExpiresAt: true },
  })

  for (const sub of expired) {
    try {
      // Verificar se usuário já liquidou manualmente
      const pendingPositions = await checkPendingPositions(sub.userId)
      const hadCompulsoryLiquidation = pendingPositions.length > 0

      if (hadCompulsoryLiquidation) {
        // Notificar usuario ANTES da liquidacao compulsoria
        await NotificationStub.notify(sub.userId, 'CANCELLATION_LOCK_ACTIVE', {
          positionsPending: pendingPositions.length,
          channels: ['in_app', 'push'],
          urgent: true,
        })

        // Executar venda compulsória a mercado
        const { totalValue } = await liquidatePositions(sub.userId, pendingPositions)

        await prisma.$transaction([
          prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } }),
          prisma.user.update({
            where: { id: sub.userId },
            data: { planType: 'JOGADOR', fsBalance: 2000 },
          }),
        ])

        await NotificationStub.notify(sub.userId, 'CANCELLATION_LOCK_LIQUIDATED', {
          positionsLiquidated: pendingPositions.length,
          totalValue,
          channels: ['in_app', 'push', 'email'],
          urgent: true,
        })

        result.details.push({
          subscriptionId: sub.id,
          action: `COMPULSORY_LIQUIDATION_${pendingPositions.length}_POSITIONS`,
        })
      } else {
        // Liquidação manual concluída — cancelamento normal
        await prisma.$transaction([
          prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } }),
          prisma.user.update({
            where: { id: sub.userId },
            data: { planType: 'JOGADOR', fsBalance: 2000 },
          }),
        ])

        await NotificationStub.notify(sub.userId, 'PLAN_CANCEL_ALERT', {
          reason: 'manual_liquidation',
          channels: ['in_app'],
        })

        result.details.push({ subscriptionId: sub.id, action: 'CANCELLED_AFTER_MANUAL_LIQUIDATION' })
      }

      result.processed++
    } catch (err) {
      console.error(`[cancellation-lock] Erro em ${sub.id}:`, err)
      result.errors++
      result.details.push({ subscriptionId: sub.id, action: 'ERROR', error: String(err) })
    }
  }

  return result
}
