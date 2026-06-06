import { OrderFlowSnapshotService } from '../OrderFlowSnapshotService'

describe('OrderFlowSnapshotService', () => {
  it('captura snapshot agrupado por asset antes do preco', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          asset_id: 'asset-1',
          open_buy_qty: BigInt(10),
          open_sell_qty: BigInt(3),
          market_buy_qty: BigInt(5),
          market_sell_qty: BigInt(0),
          order_count: BigInt(2),
          top_order_ids: ['ord-1', 'ord-2'],
        },
      ]),
    }
    const service = new OrderFlowSnapshotService(prisma as never)
    const snapshots = await service.capture(['asset-1', 'asset-2'], new Date('2026-06-06T12:00:00.000Z'))

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
    expect(snapshots.get('asset-1')).toMatchObject({
      openBuyQty: 10,
      openSellQty: 3,
      marketBuyQty: 5,
      orderSnapshotSource: 'DB',
      qualityFlags: [],
    })
    expect(snapshots.get('asset-2')?.qualityFlags).toContain('ORDER_FLOW_INELIGIBLE_ONLY')
  })

  it('degrada snapshot indisponivel sem crash', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('db timeout')) }
    const service = new OrderFlowSnapshotService(prisma as never)
    const snapshots = await service.capture(['asset-1'], new Date('2026-06-06T12:00:00.000Z'))

    expect(snapshots.get('asset-1')).toMatchObject({
      orderSnapshotSource: 'UNAVAILABLE',
      qualityFlags: ['ORDER_FLOW_SNAPSHOT_UNAVAILABLE'],
    })
  })

  it('gera EXPLAIN da query agrupada e valida indice esperado', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        { 'QUERY PLAN': 'Index Scan using idx_orders_asset_status_side_type_created_at on orders' },
        { 'QUERY PLAN': 'GroupAggregate' },
      ]),
    }
    const service = new OrderFlowSnapshotService(prisma as never)
    const result = await service.explain(['asset-1'], new Date('2026-06-06T12:00:00.000Z'))

    expect(OrderFlowSnapshotService.explainSql()).toContain('GROUP BY asset_id')
    expect(OrderFlowSnapshotService.explainSql()).toContain('asset_id = ANY($1::text[])')
    expect(result.usesExpectedIndex).toBe(true)
  })
})
