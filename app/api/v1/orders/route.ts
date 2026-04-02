// ============================================================================
// Foot Stock — POST /api/v1/orders, GET /api/v1/orders
// Criação e listagem de ordens com autenticação e validação completa.
// Rastreabilidade: INT-011..019 / TASK-1/ST003
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { type AuthContext } from '@/app/api/middleware'
import { withDataAccessLog } from '@/lib/utils/data-access-logger'
import { orderService, AppError } from '@/lib/services/OrderService'
import { CreateOrderSchema } from '@/lib/validators/order'

// ---------------------------------------------------------------------------
// POST /api/v1/orders — criar ordem
// ---------------------------------------------------------------------------

async function createOrderHandler(req: NextRequest, { user }: AuthContext) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Body inválido. Envie um JSON válido.' } },
      { status: 400 }
    )
  }

  const parsed = CreateOrderSchema.safeParse(body)
  if (!parsed.success) {
    const errors = parsed.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))
    return NextResponse.json(
      { success: false, errors },
      { status: 400 }
    )
  }

  try {
    const order = await orderService.createOrder(user.id, parsed.data)
    return NextResponse.json({ success: true, data: order }, { status: 201 })
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.message, details: err.details } },
        { status: err.statusCode }
      )
    }
    console.error('[POST /api/v1/orders]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/orders — listar ordens
// ---------------------------------------------------------------------------

const querySchema = z.object({
  status: z.string().optional(),
  ticker: z.string().optional(),
  type: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

async function listOrdersHandler(req: NextRequest, { user }: AuthContext) {
  const url = new URL(req.url)
  const params = Object.fromEntries(url.searchParams)
  const parsed = querySchema.safeParse(params)

  const filters = parsed.success ? parsed.data : { page: 1, limit: 20 }

  try {
    const result = await orderService.getOrders(user.id, filters)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[GET /api/v1/orders]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}

export const POST = withDataAccessLog(createOrderHandler, 'order_create')
export const GET = withDataAccessLog(listOrdersHandler, 'order_list')
