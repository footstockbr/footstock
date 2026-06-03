import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, error, errors } from '@/lib/api'
import { orderService, AppError } from '@/lib/services/OrderService'
import type { OrderStatus } from '@/types'

function serializeOrder(o: {
  id: string; userId: string; assetId: string; type: string; side: string
  quantity: number; price: { toNumber(): number } | null
  executedPrice: { toNumber(): number } | null
  status: string; fee: { toNumber(): number }
  scheduledAt: Date | null; groupId: string | null
  leverageMultiplier: number; executedAt: Date | null
  expiresAt: Date | null; createdAt: Date; updatedAt: Date
}) {
  return {
    id: o.id,
    userId: o.userId,
    assetId: o.assetId,
    type: o.type,
    side: o.side,
    quantity: o.quantity,
    price: o.price?.toNumber() ?? null,
    executedPrice: o.executedPrice?.toNumber() ?? null,
    status: o.status as OrderStatus,
    fee: o.fee.toNumber(),
    scheduledAt: o.scheduledAt?.toISOString() ?? null,
    leverageMultiplier: o.leverageMultiplier,
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

// DELETE /api/v1/orders/:id — cancelar ordem OPEN
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    // Delega ao service: CAS otimista + cancelamento do grupo OCO + notificações.
    // debit-on-execute → cancelar ordem OPEN não reembolsa (nada foi debitado).
    const cancelled = await orderService.cancelOrder(auth.user.id, id)
    return ok(serializeOrder(cancelled))
  } catch (err) {
    if (err instanceof AppError) {
      return error(err.code, err.message, err.statusCode, err.details)
    }
    return errors.server()
  }
}
