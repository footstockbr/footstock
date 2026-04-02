// ============================================================================
// Foot Stock — GET /api/v1/assets/[ticker]
// Detalhes completos de um ativo específico com delay por plano.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { DELAY_BY_PLAN } from '@/lib/constants/limits'
import type { PlanType } from '@/lib/enums'

const tickerSchema = z.string().regex(/^[A-Z0-9]{3,5}$/, 'Ticker inválido')

type RouteContext = { params: Promise<{ ticker: string }> }

async function assetDetailHandler(
  _req: NextRequest,
  ctx: AuthContext,
  routeCtx: RouteContext
): Promise<NextResponse> {
  const { ticker } = await routeCtx.params

  const parsed = tickerSchema.safeParse(ticker.toUpperCase())
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.VAL_003,
          message: ERROR_MESSAGES['VAL-003'] ?? 'Ticker inválido',
        },
      },
      { status: 400 }
    )
  }

  const asset = await prisma.asset.findFirst({
    where: { ticker: parsed.data },
    select: {
      id: true,
      ticker: true,
      name: true,
      clubSlug: true,
      division: true,
      cluster: true,
      currentPrice: true,
      openPrice: true,
      closePrice: true,
      volume: true,
      marketCap: true,
      isActive: true,
      colorPrimary: true,
      colorSecondary: true,
      logoUrl: true,
    },
  })

  if (!asset) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ASSET-080',
          message: ERROR_MESSAGES['VAL-009'] ?? 'Ativo não encontrado',
        },
      },
      { status: 404 }
    )
  }

  // Delay de cotação por plano
  const planType = ctx.user.planType as PlanType
  const delayMs = DELAY_BY_PLAN[planType] ?? 0
  const isDelayed = delayMs > 0

  let currentPrice = Number(asset.currentPrice)

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
      currentPrice = Number(delayedSnapshot.close)
    }
  }

  const closePrice = Number(asset.closePrice)
  const change24h = currentPrice - closePrice
  const changePercent = closePrice !== 0 ? (change24h / closePrice) * 100 : 0
  const marketCap = Number(asset.marketCap)
  const fairValuePremium = marketCap !== 0 ? ((currentPrice - closePrice) / closePrice) * 100 : 0

  return NextResponse.json({
    success: true,
    data: {
      ticker: asset.ticker,
      name: asset.name,
      cluster: asset.cluster,
      division: asset.division,
      currentPrice,
      openPrice: Number(asset.openPrice),
      closePrice,
      volume: Number(asset.volume),
      marketCap,
      colorPrimary: asset.colorPrimary,
      colorSecondary: asset.colorSecondary,
      logoUrl: asset.logoUrl ?? null,
      change24h,
      changePercent,
      fairValuePremium,
      isActive: asset.isActive,
      isHalted: false,
      delayed: isDelayed,
      delayMs,
      timestamp: Date.now(),
    },
  })
}

export function GET(req: NextRequest, routeCtx: RouteContext) {
  return withAuth((r, ctx) => assetDetailHandler(r, ctx, routeCtx))(req)
}
