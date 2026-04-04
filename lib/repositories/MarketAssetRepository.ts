// ============================================================================
// Foot Stock — MarketAssetRepository
// Listagem de ativos para a página de mercado com filtros, paginação e
// histórico de preços para sparkline.
// ============================================================================

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { AssetFilters, PaginationParams, AssetListItem } from '@/types/market'
import type { Sentiment } from '@/lib/enums'

const SENTIMENT_NEUTRAL: Sentiment = 'NEUTRO'

export interface PaginatedAssets {
  data: AssetListItem[]
  total: number
  page: number
  limit: number
}

function mapSentiment(changePercent: number): Sentiment {
  if (changePercent > 3) return 'MUITO_POSITIVO'
  if (changePercent > 0) return 'POSITIVO'
  if (changePercent < -3) return 'MUITO_NEGATIVO'
  if (changePercent < 0) return 'NEGATIVO'
  return SENTIMENT_NEUTRAL
}

export class MarketAssetRepository {
  /**
   * Listagem de ativos com filtros, paginação e priceHistory (sparkline).
   * Cap absoluto de 40 ativos por requisição.
   *
   * Evita $transaction (timeout 5s) e N+1 de priceHistory.
   * Busca assets + count em paralelo, depois priceHistory com window function.
   */
  async findAll(
    filters: AssetFilters,
    pagination: PaginationParams
  ): Promise<PaginatedAssets> {
    const { division, search, sort } = filters
    const page = pagination.page
    const limit = Math.min(pagination.limit, 40)
    const skip = (page - 1) * limit

    // ---------- WHERE clause dinâmica ----------
    const where: Prisma.AssetWhereInput = {
      isActive: true,
      ...(division && { division }),
      ...(search && {
        OR: [
          { ticker: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          // searchText: aliases internos (nomes reais, apelidos) — nunca retornado ao cliente
          { searchText: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    // ---------- ORDER BY ----------
    const orderBy: Prisma.AssetOrderByWithRelationInput =
      sort === 'volume'
        ? { volume: 'desc' }
        : { currentPrice: 'desc' } // default + change fallback

    // --- Busca assets + count em paralelo (sem $transaction para evitar timeout) ---
    const [rawAssets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.asset.count({ where }),
    ])

    if (rawAssets.length === 0) {
      return { data: [], total, page, limit }
    }

    // --- Busca priceHistory com window function: 1 query para todos os ativos ---
    // ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY timestamp DESC) evita N+1.
    const assetIds = rawAssets.map(a => a.id)

    // LATERAL join: usa o índice (asset_id, timestamp) por asset — O(log n + 60) por ativo.
    // Alternativa ao ROW_NUMBER() que faz full-scan e ao N+1 de include.
    type PhRow = { asset_id: string; close: string; timestamp: Date }
    const phRows = await prisma.$queryRaw<PhRow[]>`
      SELECT ph.asset_id, ph.close::text, ph.timestamp
      FROM unnest(${assetIds}::text[]) AS u(aid)
      JOIN LATERAL (
        SELECT asset_id, close, timestamp
        FROM price_history
        WHERE asset_id = u.aid
        ORDER BY timestamp DESC
        LIMIT 60
      ) ph ON true
      ORDER BY ph.asset_id, ph.timestamp ASC
    `

    // Agrupa por asset_id em ordem cronológica (ASC já garantido acima)
    const historyByAsset = new Map<string, number[]>()
    for (const row of phRows) {
      const prices = historyByAsset.get(row.asset_id) ?? []
      prices.push(Number(row.close))
      historyByAsset.set(row.asset_id, prices)
    }

    const data: AssetListItem[] = rawAssets.map(asset => {
      const priceHistoryValues = historyByAsset.get(asset.id) ?? []

      const currentPrice = Number(asset.currentPrice)
      const firstPrice = priceHistoryValues[0] ?? currentPrice
      const change24h =
        firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0

      return {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        division: asset.division,
        currentPrice,
        change24h,
        volume24h: Number(asset.volume),
        isHalted: asset.isHalted,
        haltReason: asset.haltReason,
        sentiment: mapSentiment(change24h),
        logoUrl: asset.logoUrl,
        colorPrimary: asset.colorPrimary,
        colorSecondary: asset.colorSecondary,
        priceHistory: priceHistoryValues,
      }
    })

    return { data, total, page, limit }
  }

  async findByTicker(ticker: string): Promise<AssetListItem | null> {
    const asset = await prisma.asset.findUnique({
      where: { ticker },
      include: {
        priceHistory: {
          orderBy: { timestamp: 'desc' },
          take: 60,
          select: { close: true, timestamp: true },
        },
      },
    })

    if (!asset) return null

    const history = [...asset.priceHistory].reverse()
    const priceHistoryValues = history.map(h => Number(h.close))
    const currentPrice = Number(asset.currentPrice)
    const firstPrice = priceHistoryValues[0] ?? currentPrice
    const change24h = firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0

    return {
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      division: asset.division,
      currentPrice,
      change24h,
      volume24h: Number(asset.volume),
      isHalted: asset.isHalted,
      haltReason: asset.haltReason,
      sentiment: mapSentiment(change24h),
      logoUrl: asset.logoUrl,
      colorPrimary: asset.colorPrimary,
      colorSecondary: asset.colorSecondary,
      priceHistory: priceHistoryValues,
    }
  }
}

export const marketAssetRepository = new MarketAssetRepository()
