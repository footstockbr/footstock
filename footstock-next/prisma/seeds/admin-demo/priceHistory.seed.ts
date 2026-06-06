/**
 * Seed: Historico de precos GBM para todos os 40 ativos
 * Referencia: TASK-025 (Historico de Graficos via GBM)
 *
 * Gera candles sinteticos via Geometric Brownian Motion com regimes
 * de mercado (bull/bear/sideways) para pre-popular graficos.
 *
 * Contagens de candles por periodo:
 *  - 1H: 60 candles de 1 minuto
 *  - 1D: 96 candles de 15 minutos
 *  - 1S: 168 candles de 1 hora
 *  - 1M: 120 candles de 6 horas
 *  Total por ativo: 444 candles
 *  Total geral: 40 ativos * 444 = 17.760 registros
 *
 * Idempotente: verifica se price_history ja tem dados GBM antes de inserir.
 * Reproducivel: seed deterministico por ativo (hash do ticker).
 *
 * GUARD: Nao executar em producao
 */

import type { PrismaClient } from '@prisma/client'
import {
  generateAllPeriodsForAsset,
  type AssetCluster,
  type CandlePeriod,
  type GBMCandle,
} from '../../../src/lib/services/GBMGenerator'

const BATCH_SIZE = 100

interface AssetForSeed {
  id: string
  ticker: string
  fairValue: number
  cluster: string
}

function buildSyntheticAttribution(asset: AssetForSeed, candle: GBMCandle) {
  const generatedAt = candle.timestamp.toISOString()
  return {
    version: 2,
    tickId: `gbm:${asset.ticker}:${candle.timestamp.getTime()}`,
    tickCount: 1,
    tickStartedAt: generatedAt,
    tickEndedAt: generatedAt,
    primaryEventId: null,
    primaryCause: 'historico sintetico GBM',
    primaryLayer: null,
    confidence: 'baixa',
    explanation: 'Candle sintetico gerado por GBM para pre-popular graficos; nao representa causa real de mercado.',
    primaryExplanation: 'Historico sintetico GBM sem rastro causal operacional real.',
    evidenceSentence: 'A evidencia e a fonte GBM do seed, nao um evento de mercado.',
    caveatSentence: 'Nao apresentar como causa confirmada de movimento real.',
    previousPrice: candle.open,
    enginePrice: candle.close,
    finalPrice: candle.close,
    engineDelta: candle.close - candle.open,
    agentImpactPct: 0,
    agentDelta: 0,
    syntheticVolume: candle.volume,
    pendingBuyVolume: 0,
    pendingSellVolume: 0,
    orderImbalance: 0,
    sessionType: 'REGULAR',
    layerContributions: [],
    causalEvents: [],
    appliedControls: [],
    qualityFlags: ['SYNTHETIC_HISTORY'],
    payloadBytes: 0,
    generatedAt,
  }
}

export async function seedAdminDemoPriceHistory(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] Nao executar seed GBM em producao!')
  }

  console.log('[seed:price-history] Verificando dados existentes...')

  // Idempotencia: verificar se ja existem candles GBM
  const existingGBM = await prisma.priceHistory.count({
    where: { source: 'GBM' },
  })

  if (existingGBM > 0) {
    console.log(`[seed:price-history] ${existingGBM} candles GBM ja existem. Pulando seed.`)
    return
  }

  // Buscar todos os ativos
  const assets = await prisma.asset.findMany({
    select: { id: true, ticker: true, fairValue: true, cluster: true },
    orderBy: { ticker: 'asc' },
  }) as unknown as AssetForSeed[]

  if (assets.length === 0) {
    console.warn('[seed:price-history] Nenhum ativo encontrado. Execute o seed de ativos primeiro.')
    return
  }

  console.log(`[seed:price-history] Gerando candles GBM para ${assets.length} ativos...`)

  const endDate = new Date()
  let totalInserted = 0

  for (const asset of assets) {
    const fairValue = typeof asset.fairValue === 'object'
      ? Number(asset.fairValue)
      : asset.fairValue

    const cluster = asset.cluster as AssetCluster
    const allPeriods = generateAllPeriodsForAsset(
      asset.ticker,
      fairValue,
      cluster,
      endDate
    )

    // Flatten all candles for this asset
    const allCandles: Array<{ period: CandlePeriod; candle: GBMCandle }> = []
    for (const [period, candles] of Object.entries(allPeriods)) {
      for (const candle of candles) {
        allCandles.push({ period: period as CandlePeriod, candle })
      }
    }

    // Insert in batches
    for (let i = 0; i < allCandles.length; i += BATCH_SIZE) {
      const batch = allCandles.slice(i, i + BATCH_SIZE)

      await prisma.priceHistory.createMany({
        data: batch.map(({ candle }) => ({
          assetId: asset.id,
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: BigInt(candle.volume),
          sessionType: 'REGULAR' as const,
          source: 'GBM',
          attribution: buildSyntheticAttribution(asset, candle),
        })),
        skipDuplicates: true,
      })

      totalInserted += batch.length
    }

    console.log(`[seed:price-history]   ${asset.ticker} [${cluster}] — ${allCandles.length} candles`)
  }

  console.log(`[seed:price-history] Seed concluido — ${totalInserted} candles GBM inseridos (${assets.length} ativos x 444)`)
}
