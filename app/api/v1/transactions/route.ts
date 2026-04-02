// ============================================================================
// Foot Stock — GET /api/v1/transactions
// Extrato de transações paginado com filtros.
// Rastreabilidade: INT-011 / TASK-2/ST003
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { type AuthContext } from '@/app/api/middleware'
import { withDataAccessLog } from '@/lib/utils/data-access-logger'
import { transactionService } from '@/lib/services/TransactionService'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  ticker: z.string().optional(),
  financialType: z.string().optional(),
})

async function handler(req: NextRequest, { user }: AuthContext) {
  const url = new URL(req.url)
  const params = Object.fromEntries(url.searchParams)
  const parsed = querySchema.safeParse(params)
  const filters = parsed.success ? parsed.data : { page: 1, limit: 20 }

  try {
    const result = await transactionService.getTransactions(user.id, filters)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[GET /api/v1/transactions]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}

export const GET = withDataAccessLog(handler, 'transaction_history')
