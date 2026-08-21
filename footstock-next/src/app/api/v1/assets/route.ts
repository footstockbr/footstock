// T-022: endpoint de lista de ativos agora requer auth e aplica delay por plano.
// JOGADOR vê preços de 60 min atrás; CRAQUE vê 30 min; LENDA vê tempo real.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { list, errors } from '@/lib/api'
import { getAuthUser } from '@/lib/auth'
import { applyDelayBatch, getDelayedSentimentBatch } from '@/lib/services/DelayService'
import type { PlanType } from '@/lib/enums'
import type { AssetListItem } from '@/types/market'
import type { Division } from '@prisma/client'

// GET /api/v1/assets
// Nota: /api/v1/market/assets é o path legado — use /api/v1/assets
export async function GET(request: NextRequest) {
  const authResult = await getAuthUser()
  if (!authResult) return errors.unauthorized()

  const planType = authResult.user.planType as PlanType

  const { searchParams } = request.nextUrl

  const division = searchParams.get('division') as Division | null
  const sentiment = searchParams.get('sentiment') as string | null
  const isHalted = searchParams.get('isHalted')

  try {
    const where = {
      ...(division && { division }),
      ...(isHalted !== null && { isHalted: isHalted === 'true' }),
    }

    const assets = await prisma.asset.findMany({
      where,
      orderBy: [{ division: 'asc' }, { ticker: 'asc' }],
    })

    // Construir AssetListItem[] para aplicação de delay em lote
    const assetItems: AssetListItem[] = assets.map((a) => ({
      id: a.id,
      ticker: a.ticker,
      displayName: a.displayName,
      currentPrice: a.currentPrice.toNumber(),
      isHalted: a.isHalted,
      division: a.division,
      sentiment: a.sentiment,
      sentimentScore: a.sentimentScore?.toNumber() ?? null,
    }))

    // Aplicar delay de cotação por plano (T-022)
    const delayedItems = await applyDelayBatch(assetItems, planType)

    // Sentimento coerente com a janela do plano (D18, E.7.3).
    // JOGADOR ve 60min atras, CRAQUE 30min, LENDA tempo real.
    // Filtro ?sentiment= opera sobre o valor atrasado, nao o tempo real.
    const delayedSentiments = await getDelayedSentimentBatch(assetItems, planType)
    const delayedSentimentMap = new Map(delayedSentiments.map((ds, i) => [assetItems[i].id, ds]))

    let serializedAssets = assets
    if (sentiment) {
      const filteredIds = new Set(
        delayedSentiments
          .filter((ds, i) => ds.sentimentLabel === sentiment)
          .map((_, i) => assetItems[i].id)
      )
      serializedAssets = assets.filter((a) => filteredIds.has(a.id))
    }

    // Mapear para formato de resposta completo
    const priceMap = new Map(delayedItems.map((d) => [d.id, d]))

    const serialized = serializedAssets.map((a) => {
      const delayed = priceMap.get(a.id)
      const currentPrice = delayed?.currentPrice ?? a.currentPrice.toNumber()
      const changePercent = delayed?.changePercent ?? 0
      const openPrice = a.openPrice.toNumber()
      const ds = delayedSentimentMap.get(a.id)

      return {
        id: a.id,
        ticker: a.ticker,
        displayName: a.displayName,
        division: a.division,
        currentPrice,
        change: changePercent,
        changePercent,
        openPrice,
        fairValue: a.fairValue.toNumber(),
        volume: Number(a.volume),
        marketCap: currentPrice * Number(a.currentSupply),
        currentSupply: Number(a.currentSupply),
        totalShares: Number(a.totalShares),
        isHalted: a.isHalted,
        haltReason: a.haltReason ?? null,
        colors: { primary: a.colorPrimary, secondary: a.colorSecondary },
        financials: a.financials,
        sentiment: ds?.sentimentLabel ?? null,
        sentimentScore: ds?.sentimentScore ?? null,
        updatedAt: a.updatedAt.toISOString(),
        _meta: {
          delayed: delayed?.delayStatus === 'AVAILABLE' ? delayed.isDelayed : false,
          delayMinutes: delayed?.delayMinutes ?? 0,
          buffering: delayed?.delayStatus === 'BUFFERING',
          timestamp: delayed?.delayedTimestamp ?? null,
        },
      }
    })

    const response = list(serialized, {
      page: 1,
      limit: serialized.length,
      total: serialized.length,
      totalPages: 1,
      hasNext: false,
    })

    // Cache privado — resposta depende do plano do usuário
    response.headers.set('Cache-Control', 'private, max-age=5')
    return response
  } catch {
    return errors.server()
  }
}
