// T-031: resolução de aliases de ticker (FLA3 → URU3) aplicada neste endpoint.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'
import { tickerSchema } from '@/lib/validators/tickerSchema'
import { PriceHistoryRepository } from '@/lib/repositories/PriceHistoryRepository'
import type { ChartPeriod } from '@/lib/repositories/PriceHistoryRepository'
import type { PlanType } from '@/lib/enums'
import { DELAY_BY_PLAN } from '@/lib/constants/limits'
import { AliasService } from '@/services/AliasService'

const querySchema = z.object({
  period: z.enum(['1H', '1D', '1W', '1S', '1M', '3M', '1Y', 'ALL']).default('1M'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

// GET /api/v1/assets/:ticker/history?period=1M
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const authResult = await getAuthUser()
  if (!authResult) return errors.unauthorized()

  const userPlan = (authResult.user as unknown as { planType: string }).planType as PlanType
  const delayMs = DELAY_BY_PLAN[userPlan] ?? DELAY_BY_PLAN.JOGADOR

  const { ticker: rawTicker } = await params
  const tickerResult = tickerSchema.safeParse(rawTicker)
  if (!tickerResult.success) {
    console.warn('[SECURITY] Invalid ticker attempt:', {
      raw: rawTicker,
      ip: request.headers.get('x-forwarded-for'),
    })
    return NextResponse.json(
      { error: { code: 'ASSET_051', message: 'Ativo inválido. Selecione um dos ativos disponíveis na plataforma.' } },
      { status: 422 }
    )
  }

  // Resolver alias: FLA3 → URU3, URU3 → URU3, XYZ9 → null (T-031)
  const resolvedTicker = await AliasService.resolve(tickerResult.data)
  if (!resolvedTicker) {
    return NextResponse.json(
      { error: { code: 'ASSET_080', message: 'Ativo não encontrado.' } },
      { status: 404 }
    )
  }
  const ticker = resolvedTicker

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VAL_002', message: 'Período inválido. Use: 1H, 1D, 1W, 1S, 1M, 3M, 1Y ou ALL.' } },
      { status: 400 }
    )
  }

  const { period, from, to } = parsed.data as {
    period: ChartPeriod
    from?: string
    to?: string
  }

  try {
    const asset = await prisma.asset.findUnique({ where: { ticker } })
    if (!asset) {
      return NextResponse.json(
        { error: { code: 'ASSET_080', message: 'Ativo não encontrado.' } },
        { status: 404 }
      )
    }

    // Aplicar delay por plano: JOGADOR recebe dados com 1h de atraso (TASK-011)
    const effectiveTo = delayMs > 0
      ? new Date(Date.now() - delayMs)
      : to ? new Date(to) : undefined

    const priceHistory = await PriceHistoryRepository.findByTicker(ticker, {
      period,
      from: from ? new Date(from) : undefined,
      to: effectiveTo,
    })

    const granularity = PriceHistoryRepository.getGranularity(period)
    const isDelayed = delayMs > 0

    const response = NextResponse.json({
      data: priceHistory,
      _meta: {
        ticker,
        period,
        from: from ?? null,
        to: to ?? null,
        count: priceHistory.length,
        granularity,
        delayed: isDelayed,
        delayMinutes: isDelayed ? delayMs / 60_000 : 0,
      },
    })

    // 1H/1D → real-time, sem cache; outros → cache de 60s
    if (period === '1H' || period === '1D') {
      response.headers.set('Cache-Control', 'no-store')
    } else {
      response.headers.set('Cache-Control', 'public, s-maxage=60')
    }

    return response
  } catch (err) {
    console.error('[API] GET /assets/[ticker]/history error', err)
    return errors.server()
  }
}
