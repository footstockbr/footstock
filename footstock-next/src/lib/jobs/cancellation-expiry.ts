// ============================================================================
// FootStock — Job: cancellation-expiry (T+7d)
// Cron diário às 02:00 UTC-3: finaliza CANCELLATION_LOCK expirado
// Encerra TODAS posições remanescentes (incluindo LONG não alavancadas)
// Aplica floor de saldo em FS$0 antes do reset final para FS$2000
// Seta status = CANCELLED, preserva histórico de transações e portfólio
// ============================================================================

import { prisma } from '@/lib/prisma'
import { shortService } from '@/lib/services/ShortService'
import { leverageService } from '@/lib/services/LeverageService'

export interface CancellationExpiryResult {
  processed: number
  errors: number
  details: Array<{ subscriptionId: string; userId: string; action: string; error?: string }>
}

const RESET_FS_BALANCE = 2000

/**
 * Encerra TODAS as posições abertas do usuário a preço de mercado.
 * Inclui LONGs não alavancadas que sobreviveram ao T+48h.
 * Retorna número de posições encerradas.
 */
async function closeAllOpenPositions(userId: string, subscriptionId: string): Promise<number> {
  const positions = await prisma.position.findMany({
    where: { userId, status: 'OPEN' },
    include: { asset: { select: { ticker: true, currentPrice: true } } },
  })

  let closed = 0

  for (const pos of positions) {
    const currentPrice = Number(pos.asset.currentPrice)
    const side = pos.side as 'LONG' | 'SHORT'

    try {
      if (side === 'SHORT') {
        await shortService.closeShort(userId, pos.id, currentPrice, 'COMPULSORY_LIQUIDATION')
      } else if (Number(pos.leverageMultiplier) > 1) {
        await leverageService.forceCloseLeveraged(pos.id, currentPrice, 'CANCELLATION_LOCK_FINAL_EXPIRY')
      } else {
        // LONG simples: encerra via update direto (liquidação a mercado)
        // Credita o valor de mercado ao saldo (value = qty * price)
        const liquidationValue = Number(pos.quantity) * currentPrice
        await prisma.$transaction(async (tx) => {
          const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
          const balanceBefore = Number(user.fsBalance)
          await tx.user.update({
            where: { id: userId },
            data: { fsBalance: balanceBefore + liquidationValue },
          })
          await tx.position.update({
            where: { id: pos.id },
            data: { status: 'CLOSED', quantity: 0 },
          })
          await tx.transaction.create({
            data: {
              userId,
              assetId: pos.assetId,
              type: 'MARKET',
              financialType: 'TRADE',
              side: 'SELL',
              quantity: pos.quantity,
              price: currentPrice,
              fee: 0,
              totalAmount: liquidationValue,
              fsAmount: liquidationValue,
              balanceBefore,
              balanceAfter: balanceBefore + liquidationValue,
            },
          })
        })
      }

      // Auditoria
      await prisma.adminMarketAction.create({
        data: {
          adminId: userId, // actor = sistema (userId do assinante)
          action: 'FORCE_SELL',
          reason: 'CANCELLATION_LOCK_FINAL_EXPIRY',
          details: {
            subscriptionId,
            positionId: pos.id,
            side,
            ticker: pos.asset.ticker,
            quantity: Number(pos.quantity),
            priceAtExecution: currentPrice,
          },
        },
      }).catch((err) => console.error('[cancellation-expiry] Falha ao registrar auditoria:', err))

      closed++
    } catch (err) {
      console.error(`[cancellation-expiry T+7d] Falha ao encerrar posição ${pos.id}:`, err)
    }
  }

  // Cancelar ordens pendentes remanescentes
  try {
    await prisma.order.updateMany({
      where: { userId, status: { in: ['OPEN', 'PARTIAL'] } },
      data: { status: 'CANCELLED' },
    })
  } catch (err) {
    console.error(`[cancellation-expiry T+7d] Falha ao cancelar ordens pendentes de ${userId}:`, err)
  }

  return closed
}

/**
 * Finaliza assinaturas em CANCELLATION_LOCK com prazo expirado (T+7d).
 * Idempotente: usa updateMany com predicados estritos (compare-and-swap).
 */
export async function processCancellationExpiries(): Promise<CancellationExpiryResult> {
  const now = new Date()
  const result: CancellationExpiryResult = { processed: 0, errors: 0, details: [] }

  const expired = await prisma.subscription.findMany({
    where: {
      status: 'CANCELLATION_LOCK',
      cancellationLockExpiresAt: { lte: now },
    },
    select: { id: true, userId: true, planType: true, cancellationLockExpiresAt: true },
  })

  for (const sub of expired) {
    // Verificar se já não foi processado por outra instância
    // (recheck sem claim ainda — claim só acontece no final após cleanup completo)
    const currentSub = await prisma.subscription.findUnique({
      where: { id: sub.id },
      select: { status: true, cancellationLockExpiresAt: true },
    })

    if (!currentSub || currentSub.status !== 'CANCELLATION_LOCK') {
      result.details.push({ subscriptionId: sub.id, userId: sub.userId, action: 'SKIPPED_STATUS_CHANGED' })
      continue
    }

    try {
      // 1. Encerrar TODAS as posições abertas (antes de marcar CANCELLED)
      const closedPositions = await closeAllOpenPositions(sub.userId, sub.id)

      // 2. Aplicar floor em FS$0 e reset para FS$2000 + marcar CANCELLED atomicamente
      // O status muda para CANCELLED DENTRO da transação, depois do cleanup
      // Se a transação falhar, subscription continua CANCELLATION_LOCK e será reprocessada
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: sub.userId } })
        const balanceBeforeReset = Number(user.fsBalance)
        const balanceFloored = Math.max(0, balanceBeforeReset) // floor: nunca negativo
        const balanceAfterReset = RESET_FS_BALANCE

        await tx.user.update({
          where: { id: sub.userId },
          data: {
            planType: 'JOGADOR',
            fsBalance: balanceAfterReset,
            marginBlocked: 0, // limpa margem bloqueada
          },
        })

        // Transação contábil de reset de saldo (auditoria)
        // assetId=null workaround: Transaction.assetId é required mas este é um ajuste de saldo sem ativo
        await tx.transaction.create({
          data: {
            userId: sub.userId,
            assetId: undefined as unknown as string,
            type: 'MARKET',
            financialType: 'TRADE',
            side: 'SELL',
            quantity: 0,
            price: 0,
            fee: 0,
            totalAmount: balanceAfterReset - balanceFloored,
            fsAmount: balanceAfterReset - balanceFloored,
            balanceBefore: balanceBeforeReset,
            balanceAfter: balanceAfterReset,
          },
        })

        // Claim + status CANCELLED dentro da mesma transação (atômico)
        // Se qualquer step acima falhar, status continua CANCELLATION_LOCK → retry seguro
        const claimResult = await tx.subscription.updateMany({
          where: {
            id: sub.id,
            status: 'CANCELLATION_LOCK', // garante que não processamos duas vezes
          },
          data: {
            status: 'CANCELLED',
            cancellationLockStartedAt: null,
            cancellationLockExpiresAt: null,
            forcedLiquidationAt: null,
          },
        })

        // Se o claim falhou (outra instância ou revert ganhou), abortar a transação
        if (claimResult.count === 0) throw new Error('CONCURRENT_PROCESSING_DETECTED')
      })

      // 3. Notificação de cancelamento definitivo
      await prisma.notification.create({
        data: {
          userId: sub.userId,
          type: 'PLAN_CANCEL_ALERT',
          title: 'Assinatura encerrada definitivamente',
          body: `Sua assinatura foi encerrada. ${closedPositions > 0 ? `${closedPositions} posição(ões) encerrada(s) a preço de mercado. ` : ''}Seu saldo foi ajustado para FS$${RESET_FS_BALANCE}. Seu histórico completo está preservado.`,
          isRead: false,
        },
      }).catch(() => {})

      result.details.push({
        subscriptionId: sub.id,
        userId: sub.userId,
        action: `CANCELLED_FINAL_${closedPositions}_POSITIONS_CLOSED`,
      })
      result.processed++
    } catch (err) {
      const errMsg = String(err)
      if (errMsg.includes('CONCURRENT_PROCESSING_DETECTED')) {
        result.details.push({ subscriptionId: sub.id, userId: sub.userId, action: 'SKIPPED_CONCURRENT_PROCESSING' })
        continue
      }
      console.error(`[cancellation-expiry T+7d] Erro ao finalizar ${sub.id}:`, err)
      result.errors++
      result.details.push({ subscriptionId: sub.id, userId: sub.userId, action: 'ERROR', error: errMsg })
    }
  }

  return result
}
