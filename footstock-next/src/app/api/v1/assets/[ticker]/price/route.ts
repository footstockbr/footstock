// ============================================================================
// FootStock — GET /api/v1/assets/:ticker/price (T-022)
// Retorna o preço atual do ativo com delay server-side por plano.
// Endpoint explícito de preço — nunca retorna preço real para JOGADOR/CRAQUE.
// ============================================================================

// T-031: resolução de aliases de ticker (FLA3 → URU3) aplicada neste endpoint.
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'
import { tickerSchema } from '@/lib/validators/tickerSchema'
import { DELAY_BY_PLAN } from '@/lib/constants/limits'
import { getDelayLabel, getCacheHint } from '@/lib/services/DelayService'
import { PriceBuffer } from '@/lib/services/PriceBuffer'
import { AliasService } from '@/services/AliasService'
import type { PlanType } from '@/lib/enums'

// GET /api/v1/assets/:ticker/price
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const authResult = await getAuthUser()
  if (!authResult) return errors.unauthorized()

  const planType = authResult.user.planType as PlanType
  const delayMs = DELAY_BY_PLAN[planType] ?? DELAY_BY_PLAN.JOGADOR
  const isDelayed = delayMs > 0

  const { ticker: rawTicker } = await params
  const tickerResult = tickerSchema.safeParse(rawTicker)
  if (!tickerResult.success) {
    console.warn('[SECURITY] Invalid ticker attempt /price:', {
      raw: rawTicker,
      ip: request.headers.get('x-forwarded-for'),
      userId: authResult.user.id,
    })
    return NextResponse.json(
      { error: { code: 'ASSET_051', message: 'Ativo inválido.' } },
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

  try {
    const asset = await prisma.asset.findUnique({
      where: { ticker },
      select: { id: true, ticker: true, currentPrice: true, isHalted: true, updatedAt: true },
    })

    if (!asset) {
      return NextResponse.json(
        { error: { code: 'ASSET_080', message: 'Ativo não encontrado.' } },
        { status: 404 }
      )
    }

    let price: number
    let bufferingWarmup = false

    if (isDelayed) {
      // Tenta buscar preço atrasado no buffer Redis
      const bufferedPrice = await PriceBuffer.getDelayed(ticker, delayMs)

      if (bufferedPrice !== null) {
        price = bufferedPrice
      } else {
        // Buffer ainda aquecendo (sistema recém-iniciado ou após restart).
        // Retorna erro explicativo — nunca retorna preço atual como fallback.
        bufferingWarmup = true
        price = 0
      }
    } else {
      price = asset.currentPrice.toNumber()
    }

    if (bufferingWarmup) {
      return NextResponse.json(
        {
          error: {
            code: 'PRICE_BUFFERING',
            message: `Dados com atraso de ${getDelayLabel(planType)} ainda não disponíveis. O sistema está aquecendo o buffer. Tente novamente em alguns instantes.`,
          },
          _meta: { plan: planType, delayMs, buffering: true },
        },
        { status: 503 }
      )
    }

    const response = NextResponse.json({
      data: {
        ticker: asset.ticker,
        price,
        isHalted: asset.isHalted,
        updatedAt: asset.updatedAt.toISOString(),
      },
      _meta: {
        plan: planType,
        delayed: isDelayed,
        delayMs: isDelayed ? delayMs : 0,
        delayMinutes: isDelayed ? delayMs / 60_000 : 0,
        delayLabel: getDelayLabel(planType),
      },
    })

    response.headers.set('Cache-Control', getCacheHint(planType))
    return response
  } catch (err) {
    console.error('[API] GET /assets/[ticker]/price error', err)
    return errors.server()
  }
}
