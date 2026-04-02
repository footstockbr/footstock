// ============================================================================
// Foot Stock — GET /api/v1/assets/[ticker]/history?period=1H|1D|1W|1M|3M|1Y
// Histórico de preços de um ativo com delay por plano.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { DELAY_BY_PLAN } from '@/lib/constants/limits'
import { priceHistoryRepository } from '@/lib/repositories/price-history.repository'
import type { PlanType } from '@/lib/enums'

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

const tickerSchema = z.string().regex(/^[A-Z0-9]{3,5}$/, 'Ticker inválido')

const VALID_PERIODS = ['1H', '1D', '1W', '1M', '3M', '1Y'] as const
type Period = (typeof VALID_PERIODS)[number]

const periodSchema = z.enum(VALID_PERIODS)

// ---------------------------------------------------------------------------
// Mapeamentos de período
// ---------------------------------------------------------------------------

const PERIOD_MS: Record<Period, number> = {
  '1H': 60 * 60 * 1_000,
  '1D': 24 * 60 * 60 * 1_000,
  '1W': 7 * 24 * 60 * 60 * 1_000,
  '1M': 30 * 24 * 60 * 60 * 1_000,
  '3M': 90 * 24 * 60 * 60 * 1_000,
  '1Y': 365 * 24 * 60 * 60 * 1_000,
}

const PERIOD_GRANULARITY: Record<Period, string> = {
  '1H': 'tick',
  '1D': 'tick',
  '1W': 'hourly',
  '1M': 'hourly',
  '3M': 'daily',
  '1Y': 'daily',
}

// ---------------------------------------------------------------------------
// Route context
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ ticker: string }> }

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function historyHandler(
  req: NextRequest,
  ctx: AuthContext,
  routeCtx: RouteContext
): Promise<NextResponse> {
  const { ticker } = await routeCtx.params

  // Validar ticker
  const tickerParsed = tickerSchema.safeParse(ticker.toUpperCase())
  if (!tickerParsed.success) {
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

  // Validar period
  const url = new URL(req.url)
  const rawPeriod = url.searchParams.get('period') ?? ''
  const periodParsed = periodSchema.safeParse(rawPeriod)
  if (!periodParsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.VAL_003,
          message: `Período inválido. Use um dos valores: ${VALID_PERIODS.join(', ')}`,
        },
      },
      { status: 400 }
    )
  }

  const period = periodParsed.data

  // Resolver assetId
  const asset = await prisma.asset.findFirst({
    where: { ticker: tickerParsed.data },
    select: { id: true, isActive: true },
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

  // Aplicar delay por plano para calcular a janela de tempo
  const planType = ctx.user.planType as PlanType
  const delayMs = DELAY_BY_PLAN[planType] ?? 0
  const effectiveNow = Date.now() - delayMs

  const periodMs = PERIOD_MS[period]
  const from = new Date(effectiveNow - periodMs)
  const to = new Date(effectiveNow)

  const rawHistory = await priceHistoryRepository.findByAssetInRange(asset.id, from, to)

  const history = rawHistory.map((h) => ({
    id: h.id,
    assetId: h.assetId,
    timestamp: h.timestamp,
    open: Number(h.open),
    high: Number(h.high),
    low: Number(h.low),
    close: Number(h.close),
    volume: Number(h.volume),
  }))

  return NextResponse.json({
    success: true,
    data: history,
    _meta: {
      period,
      count: history.length,
      granularity: PERIOD_GRANULARITY[period],
      delayed: delayMs > 0,
      delayMs,
    },
  })
}

export function GET(req: NextRequest, routeCtx: RouteContext) {
  return withAuth((r, ctx) => historyHandler(r, ctx, routeCtx))(req)
}
