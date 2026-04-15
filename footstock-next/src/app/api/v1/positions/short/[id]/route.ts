// ============================================================================
// Foot Stock — DELETE /api/v1/positions/short/[id]
// Fecha posição SHORT e retorna P&L calculado.
// Rastreabilidade: INT-014 / TASK-4/ST003
// ============================================================================

import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { error, errors } from '@/lib/api'
import { shortService } from '@/lib/services/ShortService'
import { AppError } from '@/lib/services/OrderService'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// DELETE /api/v1/positions/short/[id] — fecha posição short e retorna P&L
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id: positionId } = await params

    // Verificar que a posição existe e pertence ao usuário antes de fechar
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { asset: { select: { ticker: true, currentPrice: true } } },
    })

    if (!position || position.userId !== auth.user.id) {
      return errors.notFound('Posição não encontrada.')
    }

    if (position.side !== 'SHORT' || position.status !== 'OPEN') {
      return error('ORDER_053', 'Posição não é um short aberto.', 422)
    }

    const currentPrice = Number(position.asset.currentPrice)

    const { pnl, transaction } = await shortService.closeShort(
      auth.user.id,
      positionId,
      currentPrice
    )

    return NextResponse.json(
      {
        success: true,
        data: {
          positionId,
          ticker: position.asset.ticker,
          pnl: Number(pnl.toFixed(4)),
          transaction: {
            id: transaction.id,
            quantity: Number(transaction.quantity),
            price: currentPrice,
            fsAmount: Number((transaction.fsAmount ?? 0).toFixed(4)),
            createdAt: transaction.createdAt.toISOString(),
          },
        },
      },
      { status: 200 }
    )
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return error(err.code, err.message, err.statusCode, err.details)
    }
    return errors.server()
  }
}

// GET /api/v1/positions/short/[id] — detalhe de uma posição short
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id: positionId } = await params

    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { asset: { select: { ticker: true, currentPrice: true, displayName: true } } },
    })

    if (!position || position.userId !== auth.user.id) {
      return errors.notFound('Posição não encontrada.')
    }

    const currentPrice = Number(position.asset.currentPrice)
    const avgPrice = Number(position.avgPrice)
    const qty = Number(position.quantity)
    const marginBlocked = Number(position.marginBlocked)
    const interestAccrued = Number(position.interestAccrued)

    // P&L não realizado: short lucra quando preço cai
    const unrealizedPnl = (avgPrice - currentPrice) * qty - interestAccrued

    // Margem efetiva remanescente (proporção de margem consumida)
    const unrealizedLoss = Math.max(0, (currentPrice - avgPrice) * qty)
    const effectiveMargin = marginBlocked - unrealizedLoss
    const marginRatio = marginBlocked > 0 ? effectiveMargin / marginBlocked : 1

    return NextResponse.json(
      {
        success: true,
        data: {
          id: position.id,
          ticker: position.asset.ticker,
          assetName: position.asset.displayName,
          side: position.side,
          status: position.status,
          quantity: qty,
          avgPrice,
          currentPrice,
          marginBlocked,
          marginRatio: Number((marginRatio * 100).toFixed(2)),
          unrealizedPnl: Number(unrealizedPnl.toFixed(4)),
          interestAccrued,
          dailyInterestRate: Number(position.dailyInterestRate),
          createdAt: position.createdAt.toISOString(),
          updatedAt: position.updatedAt.toISOString(),
        },
      },
      { status: 200 }
    )
  } catch {
    return errors.server()
  }
}
