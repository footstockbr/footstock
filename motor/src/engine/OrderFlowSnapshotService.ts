import type { PrismaClient } from '@prisma/client'
import type { OrderFlowSnapshot, QualityFlag } from '../types/motor.types'
import { logger, motorMetrics } from '../utils/logger'

type SnapshotRow = {
  asset_id: string
  open_buy_qty: bigint | number | null
  open_sell_qty: bigint | number | null
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

function emptySnapshot(snapshotTakenAt: string, source: OrderFlowSnapshot['orderSnapshotSource'], flags: QualityFlag[]): OrderFlowSnapshot {
  return {
    openBuyQty: 0,
    openSellQty: 0,
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
      const rows = await this.prisma.$queryRaw<SnapshotRow[]>`
        SELECT
          asset_id,
          COALESCE(SUM(CASE WHEN side = 'BUY' AND type <> 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS open_buy_qty,
          COALESCE(SUM(CASE WHEN side = 'SELL' AND type <> 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS open_sell_qty,
          COALESCE(SUM(CASE WHEN side = 'BUY' AND type = 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS market_buy_qty,
          COALESCE(SUM(CASE WHEN side = 'SELL' AND type = 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS market_sell_qty,
          COUNT(*)::bigint AS order_count,
          ARRAY_AGG(id ORDER BY created_at ASC) FILTER (WHERE id IS NOT NULL) AS top_order_ids
        FROM orders
        WHERE asset_id = ANY(${assetIds}::text[])
          AND status IN ('OPEN', 'PARTIAL')
          AND type IN ('MARKET', 'LIMIT', 'OCO')
          AND quantity > 0
          AND created_at <= ${tickStartedAt}
          AND (expires_at IS NULL OR expires_at > ${tickStartedAt})
          AND (price IS NULL OR price > 0)
        GROUP BY asset_id
      `

      for (const row of rows) {
        const ids = (row.top_order_ids ?? []).filter((id: unknown): id is string => typeof id === 'string')
        out.set(row.asset_id, {
          openBuyQty: toNumber(row.open_buy_qty),
          openSellQty: toNumber(row.open_sell_qty),
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
    return [
      'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)',
      'SELECT asset_id,',
      "COALESCE(SUM(CASE WHEN side = 'BUY' AND type <> 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS open_buy_qty,",
      "COALESCE(SUM(CASE WHEN side = 'SELL' AND type <> 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS open_sell_qty,",
      "COALESCE(SUM(CASE WHEN side = 'BUY' AND type = 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS market_buy_qty,",
      "COALESCE(SUM(CASE WHEN side = 'SELL' AND type = 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS market_sell_qty,",
      'COUNT(*)::bigint AS order_count',
      'FROM orders',
      "WHERE asset_id = ANY($1::text[]) AND status IN ('OPEN', 'PARTIAL')",
      "AND type IN ('MARKET', 'LIMIT', 'OCO') AND quantity > 0",
      'AND created_at <= $2 AND (expires_at IS NULL OR expires_at > $2)',
      'AND (price IS NULL OR price > 0)',
      'GROUP BY asset_id',
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
