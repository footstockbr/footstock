// ============================================================================
// Foot Stock — Snapshot endpoint GET /api/v1/market/[ticker]
// Retorna preço atual + OHLCV para um ativo específico.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { z } from 'zod'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { DELAY_BY_PLAN } from '@/lib/constants/limits'

const tickerSchema = z.string().regex(/^[A-Z0-9]{3,5}$/, 'Ticker inválido')

type RouteContext = { params: Promise<{ ticker: string }> }

async function snapshotHandler(
  _req: NextRequest,
  ctx: AuthContext,
  routeCtx: RouteContext
): Promise<NextResponse> {
  const { ticker } = await routeCtx.params

  // Validar formato do ticker (sanitização)
  const parsed = tickerSchema.safeParse(ticker.toUpperCase())
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.VAL_003, message: ERROR_MESSAGES['VAL-003'] ?? 'Ticker inválido' } },
      { status: 400 }
    )
  }

  const asset = await prisma.asset.findFirst({
    where: { ticker: parsed.data, isActive: true },
    select: {
      id: true,
      ticker: true,
      name: true,
      cluster: true,
      currentPrice: true,
      openPrice: true,
      closePrice: true,
      volume: true,
    },
  })

  if (!asset) {
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: 'Ativo não encontrado' } },
      { status: 404 }
    )
  }

  // Delay de preço por plano (JOGADOR recebe preço atrasado)
  const planType = ctx.user.planType as keyof typeof DELAY_BY_PLAN
  const delayMs = DELAY_BY_PLAN[planType] ?? 0
  const isDelayed = delayMs > 0

  let price = Number(asset.currentPrice)

  if (isDelayed) {
    const delayedSnapshot = await prisma.priceHistory.findFirst({
      where: {
        assetId: asset.id,
        timestamp: { lte: new Date(Date.now() - delayMs) },
      },
      orderBy: { timestamp: 'desc' },
      select: { close: true },
    })

    if (delayedSnapshot) {
      price = Number(delayedSnapshot.close)
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      assetId: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      cluster: asset.cluster,
      price,
      open: Number(asset.openPrice),
      close: Number(asset.closePrice),
      volume: Number(asset.volume),
      delayed: isDelayed,
      delayMs,
      timestamp: Date.now(),
    },
  })
}

// Wrapper que passa o routeCtx
export function GET(req: NextRequest, routeCtx: RouteContext) {
  return withAuth((r, ctx) => snapshotHandler(r, ctx, routeCtx))(req)
}
