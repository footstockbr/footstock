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
    return prisma.position.findUnique({ where: { userId_assetId: { userId, assetId } } })
  }

  async upsert(
    userId: string,
    assetId: string,
    data: { quantity: number; avgPrice: number; totalInvested: number }
  ): Promise<Position> {
    return prisma.position.upsert({
      where: { userId_assetId: { userId, assetId } },
      create: { userId, assetId, ...data },
      update: data,
    })
  }

  async delete(userId: string, assetId: string): Promise<void> {
    await prisma.position.delete({ where: { userId_assetId: { userId, assetId } } })
  }
}

export const positionRepository = new PositionRepository()
