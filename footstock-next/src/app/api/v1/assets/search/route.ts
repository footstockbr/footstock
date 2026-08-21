// ============================================================================
// FootStock — GET /api/v1/assets/search?q=FLA3 (T-031)
// Busca de ativos com suporte a aliases de ticker.
//
// Fluxo de resolução:
//   1. Tenta resolver q como alias → ticker canônico (FLA3 → URU3)
//   2. Se não resolver como alias exato, faz busca parcial em ticker/displayName/searchText
//   3. Resposta sempre retorna ticker canônico (nunca o alias buscado)
//   4. Autocomplete: retorna ticker fictício + displayName
//
// Segurança:
//   - Requer auth
//   - searchText NUNCA retornado (SUPER_ADMIN apenas)
//   - campos sensíveis de identidade nunca retornados ao cliente
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, list } from '@/lib/api'
import { AliasService } from '@/services/AliasService'
import { getDelayedSentimentBatch } from '@/lib/services/DelayService'
import type { PlanType } from '@/lib/enums'
import type { AssetListItem } from '@/types/market'

const MAX_RESULTS = 10

// GET /api/v1/assets/search?q=FLA3
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: { code: 'SEARCH_001', message: 'Parâmetro q deve ter pelo menos 2 caracteres.' } },
      { status: 400 }
    )
  }

  const upper = q.toUpperCase()

  try {
    // 1. Tentar resolver como alias exato (FLA3 → URU3)
    const resolvedTicker = await AliasService.resolve(upper)

    if (resolvedTicker) {
      // Alias resolvido — retornar apenas o ativo canônico
      const asset = await prisma.asset.findUnique({
        where: { ticker: resolvedTicker, isActive: true },
        select: {
          id: true,
          ticker: true,
          displayName: true,
          division: true,
          currentPrice: true,
          isHalted: true,
          sentiment: true,
          sentimentScore: true,
          colorPrimary: true,
          colorSecondary: true,
        },
      })

      if (!asset) {
        return list([], { page: 1, limit: MAX_RESULTS, total: 0, totalPages: 0, hasNext: false })
      }

      // Sentimento coerente com a janela do plano (D18, E.7.3).
      const planType = auth.user.planType as PlanType
      const assetForDelay: AssetListItem = { id: asset.id, ticker: asset.ticker, displayName: asset.displayName, currentPrice: asset.currentPrice.toNumber(), sentiment: asset.sentiment, sentimentScore: asset.sentimentScore?.toNumber() ?? null }
      const delayedSents = await getDelayedSentimentBatch([assetForDelay], planType)
      const dsAlias = delayedSents[0]

      return list(
        [
          {
            id: asset.id,
            ticker: asset.ticker,
            displayName: asset.displayName,
            division: asset.division,
            currentPrice: asset.currentPrice.toNumber(),
            isHalted: asset.isHalted,
            sentiment: dsAlias?.sentimentLabel ?? null,
            sentimentScore: dsAlias?.sentimentScore ?? null,
            colors: { primary: asset.colorPrimary, secondary: asset.colorSecondary },
          },
        ],
        { page: 1, limit: MAX_RESULTS, total: 1, totalPages: 1, hasNext: false }
      )
    }

    // 2. Busca parcial em ticker + displayName (busca sem alias exato)
    // Nota: searchText é buscado mas NUNCA retornado (SUPER_ADMIN only)
    const assets = await prisma.asset.findMany({
      where: {
        isActive: true,
        OR: [
          { ticker: { contains: upper } },
          { displayName: { contains: q, mode: 'insensitive' } },
          // searchText: aliases internos de busca — usado para matching, nunca retornado
          { searchText: { contains: upper, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        ticker: true,
        displayName: true,
        division: true,
        currentPrice: true,
        isHalted: true,
        sentiment: true,
        sentimentScore: true,
        colorPrimary: true,
        colorSecondary: true,
      },
      orderBy: [{ division: 'asc' }, { ticker: 'asc' }],
      take: MAX_RESULTS,
    })

    // Sentimento coerente com a janela do plano (D18, E.7.3).
    const planType = auth.user.planType as PlanType
    const searchAssetItems: AssetListItem[] = assets.map((a) => ({
      id: a.id, ticker: a.ticker, displayName: a.displayName,
      currentPrice: a.currentPrice.toNumber(), sentiment: a.sentiment,
      sentimentScore: a.sentimentScore?.toNumber() ?? null,
    }))
    const delayedSents = await getDelayedSentimentBatch(searchAssetItems, planType)
    const delayedSentMap = new Map(delayedSents.map((ds, i) => [assets[i].id, ds]))

    const serialized = assets.map((a) => {
      const ds = delayedSentMap.get(a.id)
      return {
        id: a.id,
        ticker: a.ticker,
        displayName: a.displayName,
        division: a.division,
        currentPrice: a.currentPrice.toNumber(),
        isHalted: a.isHalted,
        sentiment: ds?.sentimentLabel ?? null,
        sentimentScore: ds?.sentimentScore ?? null,
        colors: { primary: a.colorPrimary, secondary: a.colorSecondary },
      }
    })

    return list(serialized, {
      page: 1,
      limit: MAX_RESULTS,
      total: serialized.length,
      totalPages: 1,
      hasNext: false,
    })
  } catch (err) {
    console.error('[API] GET /assets/search error', err)
    return errors.server()
  }
}
