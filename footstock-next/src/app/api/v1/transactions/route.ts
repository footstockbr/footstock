import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, parsePagination, buildPagination } from '@/lib/api'
import {
  serializeTransaction,
  buildTransactionMeta,
} from '@/lib/contracts/transaction-contract'

// Transaction.type uses OrderType enum; Transaction.financialType uses FinancialType enum
// BONUS inclui créditos de upgrade (T-021), dividendos futuros, etc.
const VALID_TYPES = ['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT', 'OCO', 'SCHEDULED']
const VALID_FINANCIAL_TYPES = ['TRADE', 'BONUS', 'DEPOSIT', 'WITHDRAWAL', 'SHORT_INTEREST', 'MARGIN_BLOCKED', 'SHORT_CLOSE', 'LEVERAGE_INTEREST', 'FEE']

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
        include: {
          asset: { select: { id: true, ticker: true, displayName: true } },
          order: { select: { id: true, type: true, executedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])

    const serialized = txns.map(serializeTransaction)
    const meta = buildTransactionMeta(serialized)

    return NextResponse.json(
      {
        data: serialized,
        pagination: buildPagination(page, limit, total),
        meta,
      },
      { status: 200 }
    )
  } catch {
    return errors.server()
  }
}
