// ============================================================================
// Foot Stock — GET /api/v1/orders/[id], DELETE /api/v1/orders/[id]
// Detalhe e cancelamento de ordem individual com proteção IDOR.
// Rastreabilidade: INT-016 / TASK-1/ST004
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { type AuthContext } from '@/app/api/middleware'
import { withDataAccessLog } from '@/lib/utils/data-access-logger'
import { orderService, AppError } from '@/lib/services/OrderService'

type RouteContext = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/v1/orders/[id] — detalhe da ordem
// ---------------------------------------------------------------------------

async function getOrderHandler(req: NextRequest, { user }: AuthContext, { params }: RouteContext) {
  const { id } = await params
  try {
    const order = await orderService.getOrder(user.id, id)
    return NextResponse.json({ success: true, data: order })
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.message } },
        { status: err.statusCode }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/orders/[id] — cancelar ordem
// ---------------------------------------------------------------------------

async function cancelOrderHandler(req: NextRequest, { user }: AuthContext, { params }: RouteContext) {
  const { id } = await params
  try {
    const order = await orderService.cancelOrder(user.id, id)
    return NextResponse.json({ success: true, data: order })
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.message, details: err.details } },
        { status: err.statusCode }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}

// Next.js 15 App Router: exportar handlers com context
export function GET(req: NextRequest, ctx: RouteContext) {
  return withDataAccessLog((r, authCtx) => getOrderHandler(r, authCtx, ctx), 'order_detail')(req)
}

export function DELETE(req: NextRequest, ctx: RouteContext) {
  return withDataAccessLog((r, authCtx) => cancelOrderHandler(r, authCtx, ctx), 'order_cancel')(req)
}
