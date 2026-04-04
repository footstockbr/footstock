// ============================================================================
// Foot Stock — DelayService
// Aplica delay de cotação por plano do usuário.
// DELAY_BY_PLAN está em milissegundos: JOGADOR=1h, CRAQUE=30min, LENDA=0.
// ============================================================================

import { DELAY_BY_PLAN } from '@/lib/constants/limits'
import type { PlanType } from '@/lib/enums'
import type { AssetListItem } from '@/types/market'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
type Decimal = Prisma.Decimal

/**
 * Retorna o delay em SEGUNDOS para exibição no frontend (campo _delaySeconds).
 * Converte de ms para s.
 */
export function getDelaySeconds(planType: PlanType): number {
  return Math.floor((DELAY_BY_PLAN[planType] ?? 0) / 1000)
}

/**
 * Retorna o label humano do delay para o DelayBadge.
 * Retorna null para plano LENDA (sem delay).
 */
export function getDelayLabel(planType: PlanType): string | null {
  const delayMs = DELAY_BY_PLAN[planType] ?? 0
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
export function getCacheHint(planType: PlanType): string {
  const secs = getDelaySeconds(planType)
  if (secs === 0) return 'private, max-age=2'
  return `private, max-age=${secs}`
}

/**
 * Aplica delay de preço em um único ativo.
 * Se LENDA (delay=0): retorna sem modificação.
 * Se delay > 0: busca o preço histórico no instante (agora - delay).
 */
export async function applyPriceDelay(
  asset: AssetListItem,
  planType: PlanType
): Promise<AssetListItem> {
  const delayMs = DELAY_BY_PLAN[planType] ?? 0
  if (delayMs === 0) return asset

  const targetDate = new Date(Date.now() - delayMs)

  const rows = await prisma.$queryRaw<Array<{ close: Decimal }>>`
    SELECT ph.close
    FROM price_history ph
    JOIN assets a ON ph.asset_id = a.id
    WHERE a.ticker = ${asset.ticker}
      AND ph.timestamp <= ${targetDate}
    ORDER BY ph.timestamp DESC
    LIMIT 1
  `
  const historicalRecord = rows[0] ?? null

  if (!historicalRecord) {
    console.warn(
      '[DelayService] Sem histórico para ticker=%s em %s',
      asset.ticker,
      targetDate.toISOString()
    )
    return asset
  }

  const historicalPrice = Number(historicalRecord.close)
  const change24h =
    historicalPrice > 0
      ? ((historicalPrice - asset.currentPrice) / asset.currentPrice) * 100
      : asset.change24h

  return { ...asset, currentPrice: historicalPrice, change24h }
}

/**
 * Aplica delay em lote (1 query para todos os tickers).
 * Se LENDA: retorna sem modificação.
 */
export async function applyDelayBatch(
  assets: AssetListItem[],
  planType: PlanType
): Promise<AssetListItem[]> {
  const delayMs = DELAY_BY_PLAN[planType] ?? 0
  if (delayMs === 0 || assets.length === 0) return assets

  const targetDate = new Date(Date.now() - delayMs)
  const tickers = assets.map(a => a.ticker)

  // Raw SQL: DISTINCT ON para pegar o registro mais recente por ativo antes do targetDate.
  // Prisma 7.x tem limitações com distinct+where-relation — raw evita o problema.
  const records = await prisma.$queryRaw<Array<{ close: Decimal; ticker: string }>>`
    SELECT DISTINCT ON (ph.asset_id) ph.close, a.ticker
    FROM price_history ph
    JOIN assets a ON ph.asset_id = a.id
    WHERE a.ticker = ANY(${tickers}::text[])
      AND ph.timestamp <= ${targetDate}
    ORDER BY ph.asset_id, ph.timestamp DESC
  `

  const priceByTicker = new Map<string, number>(
    records.map(r => [r.ticker, Number(r.close)])
  )

  return assets.map(asset => {
    const historicalPrice = priceByTicker.get(asset.ticker)
    if (!historicalPrice) return asset
    const change24h =
      asset.currentPrice > 0
        ? ((historicalPrice - asset.currentPrice) / asset.currentPrice) * 100
        : asset.change24h
    return { ...asset, currentPrice: historicalPrice, change24h }
  })
}
