import type { PrismaClient } from '@prisma/client'
import type { OrderFlowSnapshot, QualityFlag } from '../types/motor.types'
import { logger, motorMetrics } from '../utils/logger'

type SnapshotRow = {
  asset_id: string
  open_buy_qty: bigint | number | null
  open_sell_qty: bigint | number | null
  total_open_buy_qty: bigint | number | null
  total_open_sell_qty: bigint | number | null
  market_buy_qty: bigint | number | null
  market_sell_qty: bigint | number | null
  order_count: bigint | number | null
  top_order_ids: string[] | null
}

type ExplainRow = {
  'QUERY PLAN'?: string
  query_plan?: string
}

function toNumber(value: bigint | number | null | undefined): number {
  if (typeof value === 'bigint') return Number(value)
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

// OFI = pressão DIRECIONAL (fluxo agressivo/near-touch), não liquidez passiva em repouso.
// Uma ordem LIMIT longe do mercado (ex.: buy 60% abaixo do preço) é liquidez passiva que NUNCA
// executa naquele preço — contá-la como fluxo de compra congela o OFI no teto (+1) e dispara um
// pump artificial (bug COX3, 2026-07-02). Por isso ordens abertas (não-MARKET) só entram no OFI
// quando estão DENTRO desta banda de proximidade do preço atual; fora dela são ignoradas no OFI
// (continuam no book como liquidez, e no bookPressure — métrica separada de profundidade).
// MARKET (agressivo) sempre conta. Ver L4_OrderFlowImbalance.
const OFI_OPEN_PROXIMITY_BAND = 0.15 // 15%

function emptySnapshot(snapshotTakenAt: string, source: OrderFlowSnapshot['orderSnapshotSource'], flags: QualityFlag[]): OrderFlowSnapshot {
  return {
    openBuyQty: 0,
    openSellQty: 0,
    totalOpenBuyQty: 0,
    totalOpenSellQty: 0,
    marketBuyQty: 0,
    marketSellQty: 0,
    orderCount: 0,
    snapshotTakenAt,
    orderSnapshotSource: source,
    topOrderIds: [],
    orderIdsTruncated: false,
    qualityFlags: flags,
  }
}

export class OrderFlowSnapshotService {
  constructor(private readonly prisma: PrismaClient) {}

  async capture(assetIds: string[], tickStartedAt: Date): Promise<Map<string, OrderFlowSnapshot>> {
    const started = Date.now()
    const snapshotTakenAt = tickStartedAt.toISOString()
    const out = new Map<string, OrderFlowSnapshot>()
    const disabled = process.env.ORDER_FLOW_SNAPSHOT_ENABLED === 'false'
    if (disabled) {
      for (const assetId of assetIds) {
        out.set(assetId, emptySnapshot(snapshotTakenAt, 'DISABLED', ['ORDER_FLOW_SNAPSHOT_UNAVAILABLE']))
      }
      motorMetrics.observe('order_flow_snapshot_duration_ms', Date.now() - started)
      return out
    }

    for (const assetId of assetIds) {
      out.set(assetId, emptySnapshot(snapshotTakenAt, 'DB', []))
    }

    try {
      // Ordem aberta (não-MARKET) só conta como OFI quando NEAR-TOUCH: BUY com price >=
      // current_price*(1-band); SELL com price <= current_price*(1+band). Fora da banda = passiva
      // (não entra no OFI). MARKET sempre conta. A liquidez em repouso continua no book/bookPressure.
      const rows = await this.prisma.$queryRaw<SnapshotRow[]>`
        SELECT
          o.asset_id,
          COALESCE(SUM(CASE WHEN o.side = 'BUY'  AND o.type <> 'MARKET'
            AND o.price >= a.current_price * (1 - ${OFI_OPEN_PROXIMITY_BAND}) THEN o.quantity ELSE 0 END), 0)::bigint AS open_buy_qty,
          COALESCE(SUM(CASE WHEN o.side = 'SELL' AND o.type <> 'MARKET'
            AND o.price <= a.current_price * (1 + ${OFI_OPEN_PROXIMITY_BAND}) THEN o.quantity ELSE 0 END), 0)::bigint AS open_sell_qty,
          COALESCE(SUM(CASE WHEN o.side = 'BUY'  AND o.type <> 'MARKET' THEN o.quantity ELSE 0 END), 0)::bigint AS total_open_buy_qty,
          COALESCE(SUM(CASE WHEN o.side = 'SELL' AND o.type <> 'MARKET' THEN o.quantity ELSE 0 END), 0)::bigint AS total_open_sell_qty,
          COALESCE(SUM(CASE WHEN o.side = 'BUY'  AND o.type = 'MARKET' THEN o.quantity ELSE 0 END), 0)::bigint AS market_buy_qty,
          COALESCE(SUM(CASE WHEN o.side = 'SELL' AND o.type = 'MARKET' THEN o.quantity ELSE 0 END), 0)::bigint AS market_sell_qty,
          COUNT(*)::bigint AS order_count,
          ARRAY_AGG(o.id ORDER BY o.created_at ASC) FILTER (WHERE o.id IS NOT NULL) AS top_order_ids
        FROM orders o
        JOIN assets a ON a.id = o.asset_id
        WHERE o.asset_id = ANY(${assetIds}::text[])
          AND o.status IN ('OPEN', 'PARTIAL')
          AND o.type IN ('MARKET', 'LIMIT', 'OCO')
          AND o.quantity > 0
          AND o.created_at <= ${tickStartedAt}
          AND (o.expires_at IS NULL OR o.expires_at > ${tickStartedAt})
          AND (o.price IS NULL OR o.price > 0)
        GROUP BY o.asset_id
      `

      for (const row of rows) {
        const ids = (row.top_order_ids ?? []).filter((id: unknown): id is string => typeof id === 'string')
        out.set(row.asset_id, {
          openBuyQty: toNumber(row.open_buy_qty),
          openSellQty: toNumber(row.open_sell_qty),
          totalOpenBuyQty: toNumber(row.total_open_buy_qty),
          totalOpenSellQty: toNumber(row.total_open_sell_qty),
          marketBuyQty: toNumber(row.market_buy_qty),
          marketSellQty: toNumber(row.market_sell_qty),
          orderCount: toNumber(row.order_count),
          snapshotTakenAt,
          orderSnapshotSource: 'DB',
          topOrderIds: ids.slice(0, 10),
          orderIdsTruncated: ids.length > 10,
          qualityFlags: [],
        })
      }

      for (const [assetId, snapshot] of out) {
        if (snapshot.orderSnapshotSource === 'DB' && snapshot.orderCount === 0) {
          out.set(assetId, { ...snapshot, qualityFlags: ['ORDER_FLOW_INELIGIBLE_ONLY'] })
        }
      }
    } catch (err) {
      logger.error('[OrderFlowSnapshotService] Falha ao capturar snapshot causal de ordens:', err)
      for (const assetId of assetIds) {
        out.set(assetId, emptySnapshot(snapshotTakenAt, 'UNAVAILABLE', ['ORDER_FLOW_SNAPSHOT_UNAVAILABLE']))
      }
    } finally {
      motorMetrics.observe('order_flow_snapshot_duration_ms', Date.now() - started)
    }

    return out
  }

  static explainSql(): string {
    const band = OFI_OPEN_PROXIMITY_BAND
    return [
      'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)',
      'SELECT o.asset_id,',
      `COALESCE(SUM(CASE WHEN o.side = 'BUY' AND o.type <> 'MARKET' AND o.price >= a.current_price * (1 - ${band}) THEN o.quantity ELSE 0 END), 0)::bigint AS open_buy_qty,`,
      `COALESCE(SUM(CASE WHEN o.side = 'SELL' AND o.type <> 'MARKET' AND o.price <= a.current_price * (1 + ${band}) THEN o.quantity ELSE 0 END), 0)::bigint AS open_sell_qty,`,
      "COALESCE(SUM(CASE WHEN o.side = 'BUY' AND o.type <> 'MARKET' THEN o.quantity ELSE 0 END), 0)::bigint AS total_open_buy_qty,",
      "COALESCE(SUM(CASE WHEN o.side = 'SELL' AND o.type <> 'MARKET' THEN o.quantity ELSE 0 END), 0)::bigint AS total_open_sell_qty,",
      "COALESCE(SUM(CASE WHEN o.side = 'BUY' AND o.type = 'MARKET' THEN o.quantity ELSE 0 END), 0)::bigint AS market_buy_qty,",
      "COALESCE(SUM(CASE WHEN o.side = 'SELL' AND o.type = 'MARKET' THEN o.quantity ELSE 0 END), 0)::bigint AS market_sell_qty,",
      'COUNT(*)::bigint AS order_count',
      'FROM orders o JOIN assets a ON a.id = o.asset_id',
      "WHERE o.asset_id = ANY($1::text[]) AND o.status IN ('OPEN', 'PARTIAL')",
      "AND o.type IN ('MARKET', 'LIMIT', 'OCO') AND o.quantity > 0",
      'AND o.created_at <= $2 AND (o.expires_at IS NULL OR o.expires_at > $2)',
      'AND (o.price IS NULL OR o.price > 0)',
      'GROUP BY o.asset_id',
    ].join(' ')
  }

  async explain(assetIds: string[], tickStartedAt: Date): Promise<{ plan: string[]; usesExpectedIndex: boolean }> {
    const rows = await this.prisma.$queryRawUnsafe(
      OrderFlowSnapshotService.explainSql(),
      assetIds,
      tickStartedAt
    ) as ExplainRow[]
    const plan = rows
      .map((row) => row['QUERY PLAN'] ?? row.query_plan)
      .filter((line): line is string => typeof line === 'string')
    const joined = plan.join('\n')
    return {
      plan,
      usesExpectedIndex: /idx_orders_asset_status_side_type_created_at|orders.*asset.*status.*side.*type.*created/i.test(joined),
    }
  }
}
