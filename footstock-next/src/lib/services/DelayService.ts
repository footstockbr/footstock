// ============================================================================
// FootStock — DelayService
// Aplica delay de cotação por plano do usuário.
// DELAY_BY_PLAN está em milissegundos: JOGADOR=1h, CRAQUE=30min, LENDA=0.
// ============================================================================

import { DELAY_BY_PLAN } from '@/lib/constants/limits'
import type { PlanType } from '@/lib/enums'
import type { AssetListItem } from '@/types/market'
import { prisma } from '@/lib/prisma'

function normalizePlanType(planType: PlanType | null | undefined): PlanType {
  return planType === 'CRAQUE' || planType === 'LENDA' || planType === 'JOGADOR'
    ? planType
    : 'JOGADOR'
}

/**
 * Retorna o delay em SEGUNDOS para exibição no frontend (campo _delaySeconds).
 * Converte de ms para s.
 */
export function getDelaySeconds(planType: PlanType | null | undefined): number {
  return Math.floor(DELAY_BY_PLAN[normalizePlanType(planType)] / 1000)
}

/**
 * Retorna o label humano do delay para o DelayBadge.
 * Retorna null para plano LENDA (sem delay).
 */
export function getDelayLabel(planType: PlanType | null | undefined): string | null {
  const delayMs = DELAY_BY_PLAN[normalizePlanType(planType)]
  if (delayMs === 0) return null
  const secs = delayMs / 1000
  if (secs >= 3600) {
    const hours = Math.round(secs / 3600)
    return hours === 1 ? '1 hora' : `${hours} horas`
  }
  if (secs >= 60) {
    const mins = Math.round(secs / 60)
    return mins === 1 ? '1 minuto' : `${mins} minutos`
  }
  return `${secs} segundos`
}

/**
 * Retorna o header Cache-Control adequado para o plano.
 */
export function getCacheHint(planType: PlanType | null | undefined): string {
  const secs = getDelaySeconds(planType)
  if (secs === 0) return 'private, max-age=2'
  return `private, max-age=${secs}`
}

export interface DelayedPriceAvailable {
  status: 'AVAILABLE'
  currentPrice: number
  changePercent: number
  timestamp: string
  isDelayed: boolean
  delayMinutes: number
}

export interface DelayedPriceBuffering {
  status: 'BUFFERING'
  isDelayed: boolean
  delayMinutes: number
  cutoff: Date
}

export type DelayedPriceResult = DelayedPriceAvailable | DelayedPriceBuffering

function calculateChangePercent(current: number, previous: number | null): number {
  if (!previous || previous === 0) return 0
  return parseFloat(((current - previous) / previous * 100).toFixed(2))
}

/**
 * Aplica delay de preço em um único ativo.
 * Se LENDA (delay=0): retorna sem modificação.
 * Se delay > 0: busca o preço histórico no instante (agora - delay) e o snapshot
 * anterior para calcular variação dentro da mesma janela temporal.
 */
export async function applyPriceDelay(
  asset: AssetListItem,
  planType: PlanType | null | undefined
): Promise<DelayedPriceResult> {
  const delayMs = DELAY_BY_PLAN[normalizePlanType(planType)]
  const isDelayed = delayMs > 0
  const delayMinutes = delayMs / 60_000

  if (delayMs === 0) {
    return {
      status: 'AVAILABLE',
      currentPrice: asset.currentPrice,
      changePercent: asset.changePercent ?? asset.change ?? 0,
      timestamp: new Date().toISOString(),
      isDelayed: false,
      delayMinutes: 0,
    }
  }

  const cutoff = new Date(Date.now() - delayMs)

  const records = await prisma.priceHistory.findMany({
    where: {
      assetId: asset.id,
      timestamp: { lte: cutoff },
    },
    orderBy: { timestamp: 'desc' },
    take: 2,
    select: { close: true, timestamp: true },
  })

  if (records.length === 0) {
    console.warn(
      '[DelayService] BUFFERING: sem histórico para assetId=%s em %s',
      asset.id,
      cutoff.toISOString()
    )
    return { status: 'BUFFERING', isDelayed, delayMinutes, cutoff }
  }

  const currentRecord = records[0]
  const previousRecord = records[1] ?? null
  const historicalPrice = Number(currentRecord.close)
  const previousPrice = previousRecord ? Number(previousRecord.close) : null
  const changePercent = calculateChangePercent(historicalPrice, previousPrice)

  return {
    status: 'AVAILABLE',
    currentPrice: historicalPrice,
    changePercent,
    timestamp: currentRecord.timestamp.toISOString(),
    isDelayed,
    delayMinutes,
  }
}

export interface DelayedAssetListItem extends AssetListItem {
  delayStatus: 'AVAILABLE' | 'BUFFERING'
  delayedTimestamp: string | null
  isDelayed: boolean
  delayMinutes: number
}

/**
 * Aplica delay em lote (1 query para todos os ativos).
 * Se LENDA: retorna sem modificação.
 *
 * Usa assetId (scalar) no where — evita distinct+relation que Prisma 7 não suporta.
 * AssetListItem.id é o DB id do ativo.
 */
export async function applyDelayBatch(
  assets: AssetListItem[],
  planType: PlanType | null | undefined
): Promise<DelayedAssetListItem[]> {
  const delayMs = DELAY_BY_PLAN[normalizePlanType(planType)]
  const isDelayed = delayMs > 0
  const delayMinutes = delayMs / 60_000

  if (delayMs === 0 || assets.length === 0) {
    return assets.map((asset) => ({
      ...asset,
      delayStatus: 'AVAILABLE' as const,
      delayedTimestamp: new Date().toISOString(),
      isDelayed: false,
      delayMinutes: 0,
    }))
  }

  const cutoff = new Date(Date.now() - delayMs)
  const assetIds = assets.map((a) => a.id)

  // LATERAL JOIN per asset: pega até 2 snapshots anteriores ao cutoff para cada
  // ativo, permitindo calcular changePercent dentro da mesma janela temporal.
  type Row = {
    asset_id: string
    close: string
    timestamp: Date
    rn: number
  }
  const records = await prisma.$queryRaw<Row[]>`
    SELECT ph.asset_id, ph.close::text, ph.timestamp, ph.rn
    FROM unnest(${assetIds}::text[]) AS u(aid)
    JOIN LATERAL (
      SELECT asset_id, close, timestamp, ROW_NUMBER() OVER (ORDER BY timestamp DESC) AS rn
      FROM price_history
      WHERE asset_id = u.aid
        AND timestamp <= ${cutoff}
      ORDER BY timestamp DESC
      LIMIT 2
    ) ph ON true
  `

  const recordsByAsset = new Map<string, Row[]>()
  for (const r of records) {
    const list = recordsByAsset.get(r.asset_id) ?? []
    list.push(r)
    recordsByAsset.set(r.asset_id, list)
  }

  return assets.map((asset) => {
    const assetRecords = recordsByAsset.get(asset.id) ?? []
    if (assetRecords.length === 0) {
      return {
        ...asset,
        currentPrice: 0,
        change: 0,
        changePercent: 0,
        delayStatus: 'BUFFERING' as const,
        delayedTimestamp: null,
        isDelayed,
        delayMinutes,
      }
    }

    const current = assetRecords[0]
    const previous = assetRecords[1] ?? null
    const historicalPrice = Number(current.close)
    const previousPrice = previous ? Number(previous.close) : null
    const changePercent = calculateChangePercent(historicalPrice, previousPrice)

    return {
      ...asset,
      currentPrice: historicalPrice,
      change: changePercent,
      changePercent,
      delayStatus: 'AVAILABLE' as const,
      delayedTimestamp: current.timestamp.toISOString(),
      isDelayed,
      delayMinutes,
    }
  })
}
