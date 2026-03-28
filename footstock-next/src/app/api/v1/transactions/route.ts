import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'
import type { TransactionType } from '@/types'

const VALID_TYPES = ['BUY', 'SELL', 'FEE', 'DIVIDEND', 'MARGIN_CALL']

// GET /api/v1/transactions
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')
  const ticker = searchParams.get('ticker')
  const { page, limit, skip } = parsePagination(searchParams)

  if (type && !VALID_TYPES.includes(type)) {
    return errors.validation('Tipo de transação inválido.')
  }

  try {
    const where = {
      userId: auth.user.id,
      ...(type && { type: type as TransactionType }),
      ...(ticker && { ticker: ticker.toUpperCase() }),
    }

    const [txns, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])

    const serialized = txns.map((t) => ({
      id: t.id,
      userId: t.userId,
      orderId: t.orderId ?? null,
      ticker: t.ticker,
      type: t.type as TransactionType,
      amount: t.amount.toNumber(),
      fsAmount: t.fsAmount.toNumber(),
      balanceBefore: t.balanceBefore.toNumber(),
      balanceAfter: t.balanceAfter.toNumber(),
      createdAt: t.createdAt.toISOString(),
    }))

    return list(serialized, buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}
