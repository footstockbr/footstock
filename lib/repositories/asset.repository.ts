import { prisma } from '@/lib/prisma'
import type { Asset } from '@prisma/client'

export class AssetRepository {
  async findAll(activeOnly = true): Promise<Asset[]> {
    return prisma.asset.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { ticker: 'asc' },
    })
  }

  async findByTicker(ticker: string): Promise<Asset | null> {
    return prisma.asset.findUnique({ where: { ticker } })
  }

  async findById(id: string): Promise<Asset | null> {
    return prisma.asset.findUnique({ where: { id } })
  }

  async updatePrice(
    id: string,
    data: { currentPrice: number; volume?: bigint }
  ): Promise<Asset> {
    return prisma.asset.update({
      where: { id },
      data: {
        currentPrice: data.currentPrice,
        ...(data.volume !== undefined && { volume: data.volume }),
      },
    })
  }

  async findByDivision(division: 'SERIE_A' | 'SERIE_B'): Promise<Asset[]> {
    return prisma.asset.findMany({
      where: { division, isActive: true },
      orderBy: { currentPrice: 'desc' },
    })
  }
}

export const assetRepository = new AssetRepository()
