// ============================================================================
// Foot Stock — MarketEngineService
// Serviço de leitura do estado do mercado para uso no Next.js.
// Não tem acesso direto ao MarketEngine (processo separado no Railway).
// Lê do banco via Prisma e verifica liderança via Redis.
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'
import { getCurrentSession as _getCurrentSession } from './session-manager'
import type { MarketSession } from '@/lib/constants/market'

export interface MarketSnapshot {
  assetId: string
  ticker: string
  displayName: string
  currentPrice: number
  change: number
  changePercent: number
  volume: string
  colorPrimary: string
  cluster: string
  division: string
}

export interface PriceHistoryPoint {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: string
}

export class MarketEngineService {
  /**
   * Snapshot de todos os ativos ativos.
   * Plano JOGADOR recebe closePrice (sem preço em tempo real).
   */
  async getAllSnapshots(planType: string): Promise<MarketSnapshot[]> {
    const assets = await prisma.asset.findMany({
      where: { isActive: true },
      orderBy: [{ division: 'asc' }, { ticker: 'asc' }],
    })

    return assets.map(asset => {
      const currentPrice = Number(asset.currentPrice)
      const closePrice = Number(asset.closePrice)
      const change = currentPrice - closePrice
      const changePercent = closePrice > 0 ? (change / closePrice) * 100 : 0

      return {
        assetId: asset.id,
        ticker: asset.ticker,
        displayName: asset.displayName,
        currentPrice: planType === 'JOGADOR' ? closePrice : currentPrice,
        change: planType === 'JOGADOR' ? 0 : change,
        changePercent: planType === 'JOGADOR' ? 0 : changePercent,
        volume: asset.volume.toString(),
        colorPrimary: asset.colorPrimary,
        cluster: asset.cluster,
        division: asset.division,
      }
    })
  }

  /**
   * Histórico de preços OHLCV para gráfico de um ativo.
   * @param assetId ID do ativo
   * @param hours Janela de horas (default: 24)
   * @param limit Máximo de pontos (default: 288 = 24h com tick de 5min)
   */
  async getPriceHistory(
    assetId: string,
    hours = 24,
    limit = 288
  ): Promise<PriceHistoryPoint[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const history = await prisma.priceHistory.findMany({
      where: {
        assetId,
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'asc' },
      take: limit,
    })

    return history.map(h => ({
      timestamp: h.timestamp.getTime(),
      open: Number(h.open),
      high: Number(h.high),
      low: Number(h.low),
      close: Number(h.close),
      volume: h.volume.toString(),
    }))
  }

  /**
   * Verifica se o motor está rodando (checa a chave de liderança no Redis).
   */
  async isMotorRunning(): Promise<boolean> {
    const leader = await redisPublisher.get('motor:leader')
    return !!leader
  }

  /**
   * Retorna a sessão de mercado atual em BRT via date-fns-tz (inclui DST).
   * Delega para session-manager.ts — fonte canônica de detecção de sessão.
   */
  getCurrentSession(): MarketSession {
    return _getCurrentSession()
  }
}

export const marketEngineService = new MarketEngineService()
