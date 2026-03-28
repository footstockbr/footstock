import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'
import { tickerSchema } from '@/lib/validators/tickerSchema'

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
  const ticker = tickerResult.data

  try {
    const asset = await prisma.asset.findUnique({ where: { ticker } })

    if (!asset) {
      return NextResponse.json(
        { error: { code: 'ASSET_080', message: 'Ativo não encontrado.' } },
        { status: 404 }
      )
    }

    const currentPrice = asset.currentPrice.toNumber()
    const currentSupply = Number(asset.currentSupply)
    const marketCap = currentPrice * currentSupply

    const fairValue = asset.fairValue.toNumber()
    const fairValuePremium =
      fairValue > 0
        ? Number(((currentPrice - fairValue) / fairValue * 100).toFixed(2))
        : null

    const financials = (asset.financials ?? {}) as Record<string, unknown>

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
        colors: asset.colors as { primary: string; secondary: string },
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
      },
    })

    response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10')
    return response
  } catch (err) {
    console.error('[API] GET /assets/[ticker] error', err)
    return errors.server()
  }
}
