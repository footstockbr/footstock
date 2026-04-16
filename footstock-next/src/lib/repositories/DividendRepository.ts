// ============================================================================
// FootStock — DividendRepository (module-16)
// Repositório de dividendos com métodos de idempotência e consultas específicas.
// Rastreabilidade: INT-072, INT-073
// ============================================================================

import { prisma } from '@/lib/prisma'
import { BaseRepository } from '@/lib/repositories/base'
import { DIVIDEND_STATUS } from '@/lib/enums'
import type { Dividend } from '@prisma/client'

export class DividendRepository extends BaseRepository<Dividend> {
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super((prisma as any).dividend, false)
  }

  /**
   * Verifica se já existe dividendo com processedMonth igual ao mês informado.
   * Usado para garantir idempotência do job mensal.
   */
  async existsForMonth(month: string): Promise<boolean> {
    const count = await prisma.dividend.count({
      where: { processedMonth: month },
    })
    return count > 0
  }

  /**
   * Retorna dividendos PENDING do usuário ordenados por createdAt desc.
   */
  async findPendingByUserId(userId: string): Promise<Dividend[]> {
    return prisma.dividend.findMany({
      where: { userId, status: DIVIDEND_STATUS.PENDING },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Retorna dividendos paginados com filtros opcionais por tipo e status.
   */
  async findByUserPaginated(
    userId: string,
    opts: {
      type?: string
      status?: string
      page: number
      pageSize: number
    }
  ): Promise<{ items: Dividend[]; total: number }> {
    const where: Record<string, unknown> = { userId }
    if (opts.type) where.type = opts.type
    if (opts.status) where.status = opts.status

    const skip = (opts.page - 1) * opts.pageSize
    const [items, total] = await Promise.all([
      prisma.dividend.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: opts.pageSize,
        skip,
      }),
      prisma.dividend.count({ where }),
    ])

    return { items, total }
  }
}

export const dividendRepository = new DividendRepository()
