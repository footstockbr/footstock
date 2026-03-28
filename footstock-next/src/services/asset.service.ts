import { prisma } from '@/lib/prisma'
import type { Asset, AssetDivision, AssetSentiment, PriceCandle } from '@/types'

export class AssetService {
  async findAll(filters?: {
    division?: AssetDivision
    sentiment?: AssetSentiment
    isHalted?: boolean
  }): Promise<Asset[]> {
    // TODO: Implementar via /auto-flow execute
    return []
  }

  async findByTicker(ticker: string): Promise<Asset | null> {
    // TODO: Implementar via /auto-flow execute
    return null
  }

  async getPriceHistory(
    ticker: string,
    period: string,
    limit: number,
    before?: Date
  ): Promise<PriceCandle[]> {
    // TODO: Implementar via /auto-flow execute
    return []
  }
}

export const assetService = new AssetService()
