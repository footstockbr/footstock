// ============================================================================
// FootStock — YieldDifferentialService (T-007)
// Consultas e gestão do yield diferencial acumulado pelo JOGADOR.
// Permite que o frontend exiba o total pendente por posição/ticker.
// Rastreabilidade: T-007 §4
// ============================================================================

import { prisma } from '@/lib/prisma'
import { YIELD_DIFF_STATUS } from '@/lib/enums'

export interface YieldPendingSummary {
  ticker: string
  totalPending: number
  count: number
}

export interface YieldPendingByTicker {
  userId: string
  ticker: string
  totalPendingAmount: number
  entries: {
    id: string
    sourceType: string
    snapshotDate: Date
    pendingAmount: number
    createdAt: Date
  }[]
}

export class YieldDifferentialService {
  /**
   * Retorna o total de yield pendente por ticker para um usuário JOGADOR.
   */
  async getPendingByTicker(userId: string, ticker: string): Promise<number> {
    const result = await prisma.yieldDifferentialPending.aggregate({
      where: { userId, ticker, status: YIELD_DIFF_STATUS.PENDING },
      _sum: { pendingAmount: true },
    })
    return Number(result._sum.pendingAmount ?? 0)
  }

  /**
   * Retorna resumo de todos os yields pendentes do usuário agrupados por ticker.
   */
  async getPendingSummaryByUser(userId: string): Promise<YieldPendingSummary[]> {
    const rows = await prisma.yieldDifferentialPending.groupBy({
      by: ['ticker'],
      where: { userId, status: YIELD_DIFF_STATUS.PENDING },
      _sum: { pendingAmount: true },
      _count: true,
    })

    return rows.map(r => ({
      ticker: r.ticker,
      totalPending: Number(r._sum.pendingAmount ?? 0),
      count: r._count,
    }))
  }

  /**
   * Retorna detalhes completos de yield pendente por ticker para exibição no extrato.
   */
  async getPendingDetailByTicker(userId: string, ticker: string): Promise<YieldPendingByTicker> {
    const entries = await prisma.yieldDifferentialPending.findMany({
      where: { userId, ticker, status: YIELD_DIFF_STATUS.PENDING },
      orderBy: { createdAt: 'desc' },
    })

    const totalPendingAmount = entries.reduce((sum, e) => sum + Number(e.pendingAmount), 0)

    return {
      userId,
      ticker,
      totalPendingAmount,
      entries: entries.map(e => ({
        id: e.id,
        sourceType: e.sourceType,
        snapshotDate: e.snapshotDate,
        pendingAmount: Number(e.pendingAmount),
        createdAt: e.createdAt,
      })),
    }
  }

  /**
   * Quando um usuário JOGADOR faz upgrade para CRAQUE/LENDA,
   * migra todos os pendentes para créditos reais.
   */
  async migrateOnUpgrade(userId: string): Promise<{ migrated: number; totalCredited: number }> {
    const pending = await prisma.yieldDifferentialPending.findMany({
      where: { userId, status: YIELD_DIFF_STATUS.PENDING },
    })

    if (pending.length === 0) {
      return { migrated: 0, totalCredited: 0 }
    }

    const totalAmount = pending.reduce((sum, p) => sum + Number(p.pendingAmount), 0)

    await prisma.$transaction(async (tx) => {
      // Marcar todos como UPGRADED
      await tx.yieldDifferentialPending.updateMany({
        where: { userId, status: YIELD_DIFF_STATUS.PENDING },
        data: { status: YIELD_DIFF_STATUS.UPGRADED, updatedAt: new Date() },
      })

      // Creditar no saldo
      await tx.user.update({
        where: { id: userId },
        data: { fsBalance: { increment: totalAmount } },
      })

      // Criar registros de dividendo creditado para auditoria
      await tx.dividend.createMany({
        data: pending.map(p => ({
          userId,
          ticker: p.ticker,
          clubName: p.ticker, // fallback — idealmente buscar nome do clube
          type: 'YIELD_DIFFERENTIAL',
          amount: p.pendingAmount,
          yieldPercent: 0,
          status: 'CREDITED',
          triggerEvent: 'PLAN_UPGRADE',
          snapshotDate: p.snapshotDate,
          sharesSnapshot: p.sharesSnapshot,
        })),
      })
    })

    console.log(`[YieldDifferentialService] upgrade userId=${userId}: ${pending.length} pendentes creditados, FS$${totalAmount}`)
    return { migrated: pending.length, totalCredited: totalAmount }
  }
}

export const yieldDifferentialService = new YieldDifferentialService()
