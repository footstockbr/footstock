import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'
import { tickerSchema } from '@/lib/validators/tickerSchema'
import { resolveAlias } from '@/lib/utils/resolve-alias'

// GET /api/v1/market/:ticker
// Rota pública — detalhe de ativo com preço atual, OHLCV e fair value.
// Para histórico OHLCV completo: /api/v1/assets/:ticker/history
// T-024: Suporte a aliases — FLA3 resolve para URU3 de forma transparente.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await params
  const tickerResult = tickerSchema.safeParse(rawTicker)
  if (!tickerResult.success) {
    return NextResponse.json(
      { error: { code: 'ASSET_051', message: 'Ticker inválido.' } },
      { status: 422 }
    )
  }

  // Resolver alias: FLA3 → URU3 transparente
  const resolvedTicker = await resolveAlias(tickerResult.data)
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
      select: {
        id: true,
        ticker: true,
        displayName: true,
        division: true,
        cluster: true,
        currentPrice: true,
        openPrice: true,
        closePrice: true,
        fairValue: true,
        volume: true,
        currentSupply: true,
        totalShares: true,
        marketCap: true,
        isHalted: true,
        haltReason: true,
        sentiment: true,
        colorPrimary: true,
        colorSecondary: true,
        financials: true,
        updatedAt: true,
      },
    })

    if (!asset) {
      return NextResponse.json(
        { error: { code: 'ASSET_080', message: 'Ativo não encontrado.' } },
        { status: 404 }
      )
    }

    const currentPrice = asset.currentPrice.toNumber()
    const closePrice = asset.closePrice.toNumber()
    const fairValue = asset.fairValue.toNumber()
    const change = currentPrice - closePrice
    const changePercent = closePrice > 0 ? (change / closePrice) * 100 : 0
    const fairValuePremium = fairValue > 0
      ? Number(((currentPrice - fairValue) / fairValue * 100).toFixed(2))
      : null

    const response = NextResponse.json({
      data: {
        id: asset.id,
        ticker: asset.ticker,
        displayName: asset.displayName,
        division: asset.division,
        cluster: asset.cluster,
        currentPrice,
        openPrice: asset.openPrice.toNumber(),
        closePrice,
        fairValue,
        fairValuePremium,
        change: Number(change.toFixed(4)),
        changePercent: Number(changePercent.toFixed(4)),
        volume: Number(asset.volume),
        currentSupply: Number(asset.currentSupply),
        totalShares: Number(asset.totalShares),
        marketCap: asset.marketCap.toNumber(),
        isHalted: asset.isHalted,
        haltReason: asset.haltReason ?? null,
        sentiment: asset.sentiment,
        colors: { primary: asset.colorPrimary, secondary: asset.colorSecondary },
        financials: asset.financials,
        updatedAt: asset.updatedAt.toISOString(),
      },
    })

    response.headers.set('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=5')
    return response
  } catch (err) {
    console.error('[API] GET /market/[ticker] error', err)
    return errors.server()
  }
}
