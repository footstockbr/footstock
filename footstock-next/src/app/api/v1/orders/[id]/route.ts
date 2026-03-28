import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { OrderStatus } from '@/types'

function serializeOrder(o: {
  id: string; userId: string; ticker: string; type: string; side: string
  quantity: { toNumber(): number }; price: { toNumber(): number } | null
  status: string; stopLossPrice: { toNumber(): number } | null
  takeProfitPrice: { toNumber(): number } | null; scheduledAt: Date | null
  feeAmount: { toNumber(): number } | null; executedAt: Date | null
  expiresAt: Date | null; createdAt: Date; updatedAt: Date
}) {
  return {
    id: o.id,
    userId: o.userId,
    ticker: o.ticker,
    type: o.type,
    side: o.side,
    quantity: o.quantity.toNumber(),
    price: o.price?.toNumber() ?? null,
    status: o.status as OrderStatus,
    stopLossPrice: o.stopLossPrice?.toNumber() ?? null,
    takeProfitPrice: o.takeProfitPrice?.toNumber() ?? null,
    scheduledAt: o.scheduledAt?.toISOString() ?? null,
    feeAmount: o.feeAmount?.toNumber() ?? null,
    executedAt: o.executedAt?.toISOString() ?? null,
    expiresAt: o.expiresAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }
}

// GET /api/v1/orders/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const order = await prisma.order.findUnique({ where: { id } })

    if (!order) return errors.notFound('Ordem não encontrada.')
    if (order.userId !== auth.user.id) return errors.forbidden()

    return ok(serializeOrder(order))
  } catch {
    return errors.server()
  }
}

// DELETE /api/v1/orders/:id — cancelar ordem PENDING
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const order = await prisma.order.findUnique({ where: { id } })

    if (!order) return errors.notFound('Ordem não encontrada.')
    if (order.userId !== auth.user.id) return errors.forbidden()

    if (order.status !== 'PENDING') {
      return errors.conflict('ORDER_006', 'Apenas ordens pendentes podem ser canceladas.')
    }

    // TODO: Implementar via /auto-flow execute
    // Estornar saldo debitado + atualizar marginBlocked se SHORT
    const cancelled = await prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED', updatedAt: new Date() },
    })

    return ok(serializeOrder(cancelled))
  } catch {
    return errors.server()
  }
}
