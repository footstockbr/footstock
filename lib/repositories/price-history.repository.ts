import { prisma } from '@/lib/prisma'
import type { PriceHistory, Prisma } from '@prisma/client'

export class PriceHistoryRepository {
  /**
   * Retorna últimas N velas de histórico para um ativo.
   * Ordenado do mais recente para o mais antigo.
   */
  async findByAsset(assetId: string, limit = 100): Promise<PriceHistory[]> {
    return prisma.priceHistory.findMany({
      where: { assetId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })
  }

  async findByAssetInRange(
    assetId: string,
    from: Date,
    to: Date
  ): Promise<PriceHistory[]> {
    return prisma.priceHistory.findMany({
      where: {
        assetId,
        timestamp: { gte: from, lte: to },
      },
      orderBy: { timestamp: 'asc' },
    })
  }

  async create(data: Prisma.PriceHistoryCreateInput): Promise<PriceHistory> {
    return prisma.priceHistory.create({ data })
  }

  async createMany(data: Prisma.PriceHistoryCreateManyInput[]): Promise<number> {
    const result = await prisma.priceHistory.createMany({ data, skipDuplicates: true })
    return result.count
  }
}

export const priceHistoryRepository = new PriceHistoryRepository()
