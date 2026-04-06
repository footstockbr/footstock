import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'

// Transaction.type uses OrderType enum; Transaction.financialType uses FinancialType enum
const VALID_TYPES = ['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT', 'OCO', 'SCHEDULED']
const VALID_FINANCIAL_TYPES = ['TRADE', 'BONUS', 'DEPOSIT', 'WITHDRAWAL', 'SHORT_INTEREST', 'MARGIN_BLOCKED', 'SHORT_CLOSE', 'LEVERAGE_INTEREST']

// GET /api/v1/transactions
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')
  const financialType = searchParams.get('financialType')
  const assetId = searchParams.get('assetId')
  const { page, limit, skip } = parsePagination(searchParams)

  if (type && !VALID_TYPES.includes(type)) {
    return errors.validation('Tipo de transação inválido.')
  }

  if (financialType && !VALID_FINANCIAL_TYPES.includes(financialType)) {
    return errors.validation('Tipo financeiro inválido.')
  }

  try {
    const where = {
      userId: auth.user.id,
      ...(type && { type: type as never }),
      ...(financialType && { financialType: financialType as never }),
      ...(assetId && { assetId }),
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
      assetId: t.assetId,
      type: t.type,
      financialType: t.financialType,
      side: t.side,
      quantity: t.quantity,
      price: t.price.toNumber(),
      fee: t.fee.toNumber(),
      totalAmount: t.totalAmount.toNumber(),
      fsAmount: t.fsAmount?.toNumber() ?? null,
      balanceBefore: t.balanceBefore?.toNumber() ?? null,
      balanceAfter: t.balanceAfter?.toNumber() ?? null,
      createdAt: t.createdAt.toISOString(),
    }))

    return list(serialized, buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}
