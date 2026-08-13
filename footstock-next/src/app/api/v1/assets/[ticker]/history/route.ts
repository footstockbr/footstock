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

// ─── Helpers de validação temporal ───────────────────────────────────────────

function isValidISODate(value: string): boolean {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && value.length >= 10
}

function parseQueryParams(searchParams: URLSearchParams): {
  period: ChartPeriod
  from?: Date
  to?: Date
  error?: NextResponse
} {
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return {
      period: '1M',
      error: NextResponse.json(
        { error: { code: 'VAL_002', message: 'Período inválido. Use: 1H, 1D, 1W, 1S, 1M, 3M, 1Y ou ALL.' } },
        { status: 400 }
      ),
    }
  }

  const { period, from: fromStr, to: toStr } = parsed.data as {
    period: ChartPeriod
    from?: string
    to?: string
  }

  // Rejeitar combinação ambígua: period define sua própria janela; from só pode
  // ser usado junto com to (intervalo absoluto) ou com ALL.
  if (fromStr && period !== 'ALL') {
    return {
      period,
      error: NextResponse.json(
        { error: { code: 'VAL_002', message: 'Use period sozinho, ou from/to com ALL. from não pode ser combinado com period.' } },
        { status: 400 }
      ),
    }
  }

  const from = fromStr ? new Date(fromStr) : undefined
  const to = toStr ? new Date(toStr) : undefined

  if (fromStr && !isValidISODate(fromStr)) {
    return {
      period,
      error: NextResponse.json(
        { error: { code: 'VAL_002', message: 'from deve ser uma data ISO válida.' } },
        { status: 400 }
      ),
    }
  }

  if (toStr && !isValidISODate(toStr)) {
    return {
      period,
      error: NextResponse.json(
        { error: { code: 'VAL_002', message: 'to deve ser uma data ISO válida.' } },
        { status: 400 }
      ),
    }
  }

  if (from && to && from.getTime() >= to.getTime()) {
    return {
      period,
      error: NextResponse.json(
        { error: { code: 'VAL_002', message: 'from deve ser anterior a to.' } },
        { status: 400 }
      ),
    }
  }

  return { period, from, to }
}

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

  const { period, from, to, error } = parseQueryParams(request.nextUrl.searchParams)
  if (error) return error

  try {
    const asset = await prisma.asset.findUnique({ where: { ticker } })
    if (!asset) {
      return NextResponse.json(
        { error: { code: 'ASSET_080', message: 'Ativo não encontrado.' } },
        { status: 404 }
      )
    }

    // Aplicar delay por plano: JOGADOR recebe dados com 1h de atraso (TASK-011)
    const now = new Date()
    const cutoff = new Date(now.getTime() - delayMs)
    const requestedToDate = to
    const effectiveTo = delayMs > 0
      ? (requestedToDate
          ? new Date(Math.min(requestedToDate.getTime(), cutoff.getTime()))
          : cutoff)
      : (requestedToDate ?? now)

    const requestedFrom = from
    const effectiveFrom = requestedFrom

    const priceHistory = await PriceHistoryRepository.findByTicker(ticker, {
      period,
      from: effectiveFrom,
      to: effectiveTo,
    })

    const granularity = PriceHistoryRepository.getGranularity(period)
    const isDelayed = delayMs > 0
    const firstTimestamp = priceHistory[0]?.timestamp ?? null
    const lastTimestamp = priceHistory[priceHistory.length - 1]?.timestamp ?? null

    const response = NextResponse.json({
      data: priceHistory,
      _meta: {
        ticker,
        period,
        requestedFrom: requestedFrom?.toISOString() ?? null,
        requestedTo: requestedToDate?.toISOString() ?? null,
        effectiveFrom: effectiveFrom?.toISOString() ?? null,
        effectiveTo: effectiveTo.toISOString(),
        count: priceHistory.length,
        bucketSeconds: granularity === 'minute' ? 60 : granularity === 'hourly' ? 3600 : granularity === 'daily' ? 86400 : 604800,
        granularity,
        truncated: false,
        isDelayed,
        delayMinutes: isDelayed ? delayMs / 60_000 : 0,
        firstTimestamp,
        lastTimestamp,
      },
    })

    // Resposta autenticada depende do plano: nunca cache público
    response.headers.set('Cache-Control', 'private, no-store')

    return response
  } catch (err) {
    console.error('[API] GET /assets/[ticker]/history error', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    if (message.includes('não está habilitado') || message.includes('não suportado')) {
      return NextResponse.json(
        { error: { code: 'VAL_002', message } },
        { status: 400 }
      )
    }
    return errors.server()
  }
}
