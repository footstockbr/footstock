// ============================================================================
// FootStock — Job: credit-dividends (module-16)
// Credita dividendos PENDING cujo prazo (scheduledFor) foi atingido.
// Chama WalletService.credit() e emite DIVIDEND_CREDITED.
// Rastreabilidade: INT-073
// ============================================================================

import { prisma } from '@/lib/prisma'
import { DIVIDEND_STATUS, DIVIDEND_TYPE, NOTIFICATION_TYPE } from '@/lib/enums'
import { getWalletBalance } from '@/lib/services/WalletService'
import { sendNotification } from '@/lib/services/NotificationService'

// Limite de concorrência: mantém conexões simultâneas abaixo do pool_size do pgBouncer (~20-25)
const BATCH_SIZE = 10

/**
 * Credita dividendos PENDING onde scheduledFor <= NOW().
 * Processa em lotes de BATCH_SIZE para não saturar o pool de conexões do pgBouncer.
 */
export async function creditReadyDividends(): Promise<{ credited: number; failed: number }> {
  const now = new Date()

  const readyDividends = await prisma.dividend.findMany({
    where: {
      status: DIVIDEND_STATUS.PENDING,
      scheduledFor: { lte: now },
    },
    include: { user: { select: { id: true } } },
  })

  if (readyDividends.length === 0) {
    console.log('[CreditDividends] 0 dividendos prontos para crédito')
    return { credited: 0, failed: 0 }
  }

  let credited = 0
  let failed = 0

  for (let i = 0; i < readyDividends.length; i += BATCH_SIZE) {
    const batch = readyDividends.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (dividend) => {
        await prisma.$transaction(async (tx) => {
          await tx.dividend.update({
            where: { id: dividend.id },
            data: { status: DIVIDEND_STATUS.CREDITED },
          })
          await tx.user.update({
            where: { id: dividend.userId },
            data: { fsBalance: { increment: dividend.amount } },
          })
        })

        const newBalance = await getWalletBalance(dividend.userId)
        await sendNotification(dividend.userId, NOTIFICATION_TYPE.DIVIDEND_CREDITED, {
          title: 'Dividendo Creditado',
          body: `Dividendo de FS\$${Number(dividend.amount)} creditado para ${dividend.ticker}.`,
          metadata: {
            value: Number(dividend.amount),
            ticker: dividend.ticker,
            dividendType: dividend.type === DIVIDEND_TYPE.ESPORTIVO ? 'Esportivo' : 'Financeiro',
            newBalance,
          },
        })
      })
    )

    results.forEach((r, j) => {
      if (r.status === 'fulfilled') {
        credited++
      } else {
        failed++
        console.error(`[CreditDividends] erro ao creditar dividendId=${batch[j]?.id}:`, r.reason)
      }
    })
  }

  console.log(`[CreditDividends] ${credited} creditados, ${failed} falhas`)
  return { credited, failed }
}
