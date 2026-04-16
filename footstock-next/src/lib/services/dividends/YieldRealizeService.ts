// ============================================================================
// FootStock — YieldRealizeService (T-007)
// Realiza o yield diferencial pendente quando JOGADOR vende posição.
// Proporcional: se vende 50% das ações, realiza 50% do pendente.
// Rastreabilidade: T-007 §4
// ============================================================================

import { prisma } from '@/lib/prisma'
import { YIELD_DIFF_STATUS, NOTIFICATION_TYPE } from '@/lib/enums'
import { sendNotification } from '@/lib/services/NotificationService'

export interface YieldRealizeInput {
  userId: string
  ticker: string
  /** Quantidade de ações vendidas nesta operação */
  quantitySold: number
  /** Total de ações que o usuário possuía ANTES desta venda */
  totalSharesBefore: number
  /** ID da transação de venda (para rastreabilidade) */
  sellTransactionId: string
}

export interface YieldRealizeResult {
  realized: boolean
  amountRealized: number
  entriesUpdated: number
}

export class YieldRealizeService {
  /**
   * Chamado quando JOGADOR executa venda de posição.
   * Realiza a fração do yield pendente proporcional às ações vendidas.
   */
  async realizeOnSell(input: YieldRealizeInput): Promise<YieldRealizeResult> {
    const { userId, ticker, quantitySold, totalSharesBefore, sellTransactionId } = input

    if (totalSharesBefore <= 0 || quantitySold <= 0) {
      return { realized: false, amountRealized: 0, entriesUpdated: 0 }
    }

    const pendingEntries = await prisma.yieldDifferentialPending.findMany({
      where: { userId, ticker, status: YIELD_DIFF_STATUS.PENDING },
      orderBy: { createdAt: 'asc' },
    })

    if (pendingEntries.length === 0) {
      return { realized: false, amountRealized: 0, entriesUpdated: 0 }
    }

    // Proporção da venda em relação ao total de ações antes da venda
    const sellRatio = Math.min(quantitySold / totalSharesBefore, 1)
    let totalAmountRealized = 0
    let entriesUpdated = 0

    await prisma.$transaction(async (tx) => {
      for (const entry of pendingEntries) {
        const pendingAmount = Number(entry.pendingAmount)
        const amountToRealize = fixedRound(pendingAmount * sellRatio)

        if (amountToRealize <= 0) continue

        const remainingAmount = fixedRound(pendingAmount - amountToRealize)

        if (remainingAmount <= 0) {
          // Realização total desta entrada
          await tx.yieldDifferentialPending.update({
            where: { id: entry.id },
            data: {
              pendingAmount: 0,
              status: YIELD_DIFF_STATUS.REALIZED,
              realizedAt: new Date(),
              realizedTransactionId: sellTransactionId,
            },
          })
        } else {
          // Realização parcial — mantém o restante PENDING
          await tx.yieldDifferentialPending.update({
            where: { id: entry.id },
            data: { pendingAmount: remainingAmount },
          })

          // Cria novo registro para a fração realizada (audit trail)
          await tx.yieldDifferentialPending.create({
            data: {
              userId,
              ticker: entry.ticker,
              sourceType: entry.sourceType,
              sourceDividendId: entry.sourceDividendId,
              snapshotDate: entry.snapshotDate,
              sharesSnapshot: Number(entry.sharesSnapshot) * sellRatio,
              pendingAmount: 0,
              status: YIELD_DIFF_STATUS.REALIZED,
              realizedAt: new Date(),
              realizedTransactionId: sellTransactionId,
            },
          })
        }

        totalAmountRealized += amountToRealize
        entriesUpdated++
      }

      if (totalAmountRealized > 0) {
        // Incorporar yield realizado no saldo do usuário
        await tx.user.update({
          where: { id: userId },
          data: { fsBalance: { increment: totalAmountRealized } },
        })

        // Registrar no ledger de dividendos para audit trail
        await tx.dividend.create({
          data: {
            userId,
            ticker,
            clubName: ticker,
            type: 'YIELD_DIFFERENTIAL',
            amount: totalAmountRealized,
            yieldPercent: 0,
            status: 'CREDITED',
            triggerEvent: 'SELL_REALIZATION',
          },
        })
      }
    })

    if (totalAmountRealized > 0) {
      await sendNotification(userId, NOTIFICATION_TYPE.DIVIDEND_CREDITED, {
        title: 'Yield Realizado na Venda',
        body: `FS$${totalAmountRealized} de yield incorporado na venda de ${ticker}.`,
        metadata: {
          value: totalAmountRealized,
          ticker,
          dividendType: 'Yield Diferencial',
          sellTransactionId,
        },
      })
    }

    console.log(`[YieldRealizeService] userId=${userId} ${ticker}: FS$${totalAmountRealized} realizados, ${entriesUpdated} entradas`)
    return { realized: totalAmountRealized > 0, amountRealized: totalAmountRealized, entriesUpdated }
  }
}

function fixedRound(value: number): number {
  return Math.round(value * 100) / 100
}

export const yieldRealizeService = new YieldRealizeService()
