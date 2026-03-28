import { prisma } from '@/lib/prisma'
import type { Transaction, Prisma } from '@prisma/client'

export class TransactionRepository {
  async findByUser(
    userId: string,
    page = 1,
    pageSize = 20
  ): Promise<{ data: Transaction[]; total: number }> {
    const where: Prisma.TransactionWhereInput = { userId }

    const [data, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { asset: { select: { ticker: true, name: true, colorPrimary: true } } },
      }),
      prisma.transaction.count({ where }),
    ])

    return { data, total }
  }

  async create(data: Prisma.TransactionCreateInput): Promise<Transaction> {
    return prisma.transaction.create({ data })
  }

  async findById(id: string): Promise<Transaction | null> {
    return prisma.transaction.findUnique({ where: { id } })
  }
}

export const transactionRepository = new TransactionRepository()
