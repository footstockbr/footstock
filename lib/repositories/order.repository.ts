import { prisma } from '@/lib/prisma'
import type { Order, Prisma, OrderStatus } from '@prisma/client'

export class OrderRepository {
  async findOpenByAsset(assetId: string): Promise<Order[]> {
    return prisma.order.findMany({
      where: { assetId, status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
    })
  }

  async findByUser(
    userId: string,
    status?: OrderStatus,
    page = 1,
    pageSize = 20
  ): Promise<{ data: Order[]; total: number }> {
    const where: Prisma.OrderWhereInput = { userId }
    if (status) where.status = status

    const [data, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { asset: { select: { ticker: true, name: true, colorPrimary: true } } },
      }),
      prisma.order.count({ where }),
    ])

    return { data, total }
  }

  async create(data: Prisma.OrderCreateInput): Promise<Order> {
    return prisma.order.create({ data })
  }

  async updateStatus(id: string, status: OrderStatus, executedPrice?: number): Promise<Order> {
    return prisma.order.update({
      where: { id },
      data: {
        status,
        ...(executedPrice !== undefined && { executedPrice }),
      },
    })
  }
}

export const orderRepository = new OrderRepository()
