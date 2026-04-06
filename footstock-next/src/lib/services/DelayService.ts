// ============================================================================
// Foot Stock — DelayService
// Aplica delay de cotação por plano do usuário.
// DELAY_BY_PLAN está em milissegundos: JOGADOR=1h, CRAQUE=30min, LENDA=0.
// ============================================================================

import { DELAY_BY_PLAN } from '@/lib/constants/limits'
import type { PlanType } from '@/lib/enums'
import type { AssetListItem } from '@/types/market'
import { prisma } from '@/lib/prisma'

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

  // Usa assetId (scalar) diretamente — sem filtro por relação para evitar
  // limitação do Prisma 7 com distinct+relation.
  const record = await prisma.priceHistory.findFirst({
    where: {
      assetId: asset.id,
      timestamp: { lte: targetDate },
    },
    orderBy: { timestamp: 'desc' },
    select: { close: true },
  })

  if (!record) {
    console.warn(
      '[DelayService] Sem histórico para assetId=%s em %s',
      asset.id,
      targetDate.toISOString()
    )
    return asset
  }

  const historicalPrice = Number(record.close)
  const change =
    historicalPrice > 0
      ? ((historicalPrice - asset.currentPrice) / asset.currentPrice) * 100
      : asset.change

  return { ...asset, currentPrice: historicalPrice, change }
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
  planType: PlanType
): Promise<AssetListItem[]> {
  const delayMs = DELAY_BY_PLAN[planType] ?? 0
  if (delayMs === 0 || assets.length === 0) return assets

  const targetDate = new Date(Date.now() - delayMs)
  const assetIds = assets.map(a => a.id)

  // LATERAL JOIN per asset: uses (asset_id, timestamp) index — O(log n + 1) per asset.
  // Replaces distinct+orderBy Prisma query that caused full-scan on 1.2M rows (60s timeout).
  type Row = { asset_id: string; close: string }
  const records = await prisma.$queryRaw<Row[]>`
    SELECT ph.asset_id, ph.close::text
    FROM unnest(${assetIds}::text[]) AS u(aid)
    JOIN LATERAL (
      SELECT asset_id, close
      FROM price_history
      WHERE asset_id = u.aid
        AND timestamp <= ${targetDate}
      ORDER BY timestamp DESC
      LIMIT 1
    ) ph ON true
  `

  const priceByAssetId = new Map<string, number>(
    records.map(r => [r.asset_id, Number(r.close)])
  )

  return assets.map(asset => {
    const historicalPrice = priceByAssetId.get(asset.id)
    if (!historicalPrice) return asset
    const change =
      asset.currentPrice > 0
        ? ((historicalPrice - asset.currentPrice) / asset.currentPrice) * 100
        : asset.change
    return { ...asset, currentPrice: historicalPrice, change }
  })
}
