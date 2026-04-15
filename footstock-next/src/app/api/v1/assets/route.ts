// T-022: endpoint de lista de ativos agora requer auth e aplica delay por plano.
// JOGADOR vê preços de 60 min atrás; CRAQUE vê 30 min; LENDA vê tempo real.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { list, errors } from '@/lib/api'
import { getAuthUser } from '@/lib/auth'
import { applyDelayBatch } from '@/lib/services/DelayService'
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
      ...(sentiment && { sentiment }),
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
    }))

    // Aplicar delay de cotação por plano (T-022)
    const delayedItems = await applyDelayBatch(assetItems, planType)

    // Mapear para formato de resposta completo
    const priceMap = new Map(delayedItems.map((d) => [d.id, d.currentPrice]))

    const serialized = assets.map((a) => {
      const currentPrice = priceMap.get(a.id) ?? a.currentPrice.toNumber()
      const openPrice = a.openPrice.toNumber()
      const change = openPrice > 0
        ? parseFloat(((currentPrice - openPrice) / openPrice * 100).toFixed(2))
        : 0

      return {
        id: a.id,
        ticker: a.ticker,
        displayName: a.displayName,
        division: a.division,
        currentPrice,
        change,
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
        sentiment: a.sentiment,
        updatedAt: a.updatedAt.toISOString(),
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
