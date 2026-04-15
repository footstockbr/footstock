// T-022: currentPrice agora respeita o delay do plano do usuário.
// JOGADOR vê preço de 60 min atrás; CRAQUE vê preço de 30 min atrás; LENDA vê preço real.
// T-024: Suporte a aliases — FLA3 resolve para URU3 de forma transparente.
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'
import { tickerSchema } from '@/lib/validators/tickerSchema'
import { applyPriceDelay } from '@/lib/services/DelayService'
import { resolveAlias } from '@/lib/utils/resolve-alias'
import type { PlanType } from '@/lib/enums'
import type { AssetListItem } from '@/types/market'

// GET /api/v1/assets/:ticker
export async function GET(
  request: Request,
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

  // Resolver alias: FLA3 → URU3, URU3 → URU3, XYZ9 → null
  const resolvedTicker = await resolveAlias(tickerResult.data)
  if (!resolvedTicker) {
    return NextResponse.json(
      { error: { code: 'ASSET_080', message: 'Ativo não encontrado.' } },
      { status: 404 }
    )
  }
  const ticker = resolvedTicker

  try {
    const asset = await prisma.asset.findUnique({ where: { ticker } })

    if (!asset) {
      return NextResponse.json(
        { error: { code: 'ASSET_080', message: 'Ativo não encontrado.' } },
        { status: 404 }
      )
    }

    const rawPrice = asset.currentPrice.toNumber()
    const currentSupply = Number(asset.currentSupply)

    // Aplicar delay de preço por plano (T-022)
    const planType = authResult.user.planType as PlanType
    const assetItem: AssetListItem = {
      id: asset.id,
      ticker: asset.ticker,
      displayName: asset.displayName,
      currentPrice: rawPrice,
    }
    const delayed = await applyPriceDelay(assetItem, planType)
    const currentPrice = delayed.currentPrice

    const marketCap = currentPrice * currentSupply

    const fairValue = asset.fairValue.toNumber()
    const fairValuePremium =
      fairValue > 0
        ? Number(((currentPrice - fairValue) / fairValue * 100).toFixed(2))
        : null

    const financials = (asset.financials ?? {}) as Record<string, unknown>

    const isDelayed = currentPrice !== rawPrice
    const response = NextResponse.json({
      data: {
        id: asset.id,
        ticker: asset.ticker,
        displayName: asset.displayName,
        division: asset.division,
        currentPrice,
        fairValue,
        currentSupply,
        totalShares: Number(asset.totalShares),
        isHalted: asset.isHalted,
        haltReason: asset.haltReason ?? null,
        colors: { primary: asset.colorPrimary, secondary: asset.colorSecondary },
        financials: {
          ...financials,
          marketCap,
          ipoPrice: (financials.ipoPrice as number | null) ?? null,
          equityValue: (financials.equityValue as number | null) ?? null,
          freeFloat: (financials.freeFloat as number | null) ?? null,
          totalShares: Number(asset.totalShares),
        },
        fairValuePremium,
        sentiment: asset.sentiment,
        updatedAt: asset.updatedAt.toISOString(),
        _meta: { delayed: isDelayed },
      },
    })

    // Cache privado — delay depende do plano, nunca compartilhar entre usuários
    response.headers.set('Cache-Control', 'private, max-age=5')
    return response
  } catch (err) {
    console.error('[API] GET /assets/[ticker] error', err)
    return errors.server()
  }
}
