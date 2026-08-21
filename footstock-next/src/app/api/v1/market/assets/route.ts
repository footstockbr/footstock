import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { list, errors } from '@/lib/api'
import { getDelayedSentimentBatch } from '@/lib/services/DelayService'
import type { Division } from '@prisma/client'
import type { AssetListItem } from '@/types/market'

// GET /api/v1/market/assets
// Rota pública — lista ativos com preços de mercado (sem auth).
// Delegação canônica: /api/v1/assets (autenticado) tem superset destes campos.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const division = searchParams.get('division') as Division | null
  const isHalted = searchParams.get('isHalted')

  try {
    const assets = await prisma.asset.findMany({
      where: {
        isActive: true,
        ...(division && { division }),
        ...(isHalted !== null && { isHalted: isHalted === 'true' }),
      },
      orderBy: [{ division: 'asc' }, { ticker: 'asc' }],
      select: {
        id: true,
        ticker: true,
        displayName: true,
        division: true,
        cluster: true,
        currentPrice: true,
        openPrice: true,
        closePrice: true,
        volume: true,
        isHalted: true,
        sentiment: true,
        sentimentScore: true,
        colorPrimary: true,
        colorSecondary: true,
        updatedAt: true,
      },
    })

    // Sentimento coerente com a janela do plano (D18, E.7.3).
    // Rota sem auth — aplica delay JOGADOR (60min) como piso de seguranca
    // para evitar canal lateral de informacao.
    const marketAssetItems: AssetListItem[] = assets.map((a) => ({
      id: a.id,
      ticker: a.ticker,
      displayName: a.displayName,
      currentPrice: a.currentPrice.toNumber(),
      sentiment: a.sentiment,
      sentimentScore: a.sentimentScore?.toNumber() ?? null,
    }))
    const delayedSentiments = await getDelayedSentimentBatch(marketAssetItems, 'JOGADOR')
    const delayedSentimentMap = new Map(delayedSentiments.map((ds, i) => [assets[i].id, ds]))

    const serialized = assets.map((a) => {
      const currentPrice = a.currentPrice.toNumber()
      const closePrice = a.closePrice.toNumber()
      const change = currentPrice - closePrice
      const changePercent = closePrice > 0 ? (change / closePrice) * 100 : 0
      const ds = delayedSentimentMap.get(a.id)

      return {
        id: a.id,
        ticker: a.ticker,
        displayName: a.displayName,
        division: a.division,
        cluster: a.cluster,
        currentPrice,
        openPrice: a.openPrice.toNumber(),
        change: Number(change.toFixed(4)),
        changePercent: Number(changePercent.toFixed(4)),
        volume: Number(a.volume),
        isHalted: a.isHalted,
        sentiment: ds?.sentimentLabel ?? null,
        sentimentScore: ds?.sentimentScore ?? null,
        colors: { primary: a.colorPrimary, secondary: a.colorSecondary },
        updatedAt: a.updatedAt.toISOString(),
      }
    })

    return list(serialized, {
      page: 1,
      limit: serialized.length,
      total: serialized.length,
      totalPages: 1,
      hasNext: false,
    })
  } catch {
    return errors.server()
  }
}
