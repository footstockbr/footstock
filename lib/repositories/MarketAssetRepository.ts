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
        : sort === 'change'
          ? { currentPrice: 'desc' } // aproximação: sem change24h no DB
          : { currentPrice: 'desc' } // default

    const [rawAssets, total] = await prisma.$transaction([
      prisma.asset.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          priceHistory: {
            orderBy: { timestamp: 'desc' },
            take: 60,
            select: { close: true, timestamp: true },
          },
        },
      }),
      prisma.asset.count({ where }),
    ])

    const data: AssetListItem[] = rawAssets.map(asset => {
      const history = [...asset.priceHistory].reverse()
      const priceHistoryValues = history.map(h => Number(h.close))

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
