import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'
import { tickerSchema } from '@/lib/validators/tickerSchema'
import { PriceHistoryRepository } from '@/lib/repositories/PriceHistoryRepository'
import type { ChartPeriod } from '@/lib/repositories/PriceHistoryRepository'

const querySchema = z.object({
  period: z.enum(['1D', '1W', '1M', '3M', '1Y', 'ALL']).default('1M'),
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
  const ticker = tickerResult.data

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VAL_002', message: 'Período inválido. Use: 1D, 1W, 1M, 3M, 1Y ou ALL.' } },
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

    const priceHistory = await PriceHistoryRepository.findByTicker(ticker, {
      period,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    })

    const granularity = PriceHistoryRepository.getGranularity(period)

    const response = NextResponse.json({
      data: priceHistory,
      _meta: {
        ticker,
        period,
        from: from ?? null,
        to: to ?? null,
        count: priceHistory.length,
        granularity,
      },
    })

    // 1D → real-time, sem cache; outros → cache de 60s
    if (period === '1D') {
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
