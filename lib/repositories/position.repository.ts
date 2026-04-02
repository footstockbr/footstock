import { prisma } from '@/lib/prisma'
import type { Position } from '@prisma/client'

export class PositionRepository {
  async findByUser(userId: string): Promise<Position[]> {
    return prisma.position.findMany({
      where: { userId },
      include: {
        asset: {
          select: { ticker: true, name: true, currentPrice: true, colorPrimary: true },
        },
      },
    })
  }

  async findByUserAndAsset(userId: string, assetId: string): Promise<Position | null> {
    return prisma.position.findFirst({
      where: { userId, assetId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    })
  }

  async upsert(
    userId: string,
    assetId: string,
    data: { quantity: number; avgPrice: number; totalInvested: number }
  ): Promise<Position> {
    const existing = await prisma.position.findFirst({
      where: { userId, assetId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    if (existing) {
      return prisma.position.update({
        where: { id: existing.id },
        data,
      })
    }

    return prisma.position.create({
      data: { userId, assetId, ...data },
    })
  }

  async delete(userId: string, assetId: string): Promise<void> {
    await prisma.position.deleteMany({ where: { userId, assetId, status: 'OPEN' } })
  }
}

export const positionRepository = new PositionRepository()
