import { buildPriceAttribution, buildPriceAttributionV2, mergePriceAttributions, parsePriceAttribution } from '../PriceAttribution'

describe('PriceAttribution', () => {
  it('seleciona a maior contribuição de camada como causa primária', () => {
    const attribution = buildPriceAttribution({
      previousPrice: 3,
      enginePrice: 3.04,
      finalPrice: 3.03,
      agentImpact: -0.003289,
      syntheticVolume: 14,
      pendingBuyVolume: 32,
      pendingSellVolume: 4,
      sessionType: 'TRADING',
      generatedAt: new Date('2026-06-05T12:00:00.000Z'),
      layerResults: [
        { layer: 'L1_OrnsteinUhlenbeck', deltaPrice: 0.005 },
        { layer: 'L2_FundamentalAnchor', deltaPrice: 0.03 },
        { layer: 'L4_OrderFlowImbalance', deltaPrice: 0.01 },
        { layer: 'L8_VelocityCap', deltaPrice: -0.005 },
      ],
    })

    expect(attribution.primaryLayer).toBe('L2_FundamentalAnchor')
    expect(attribution.primaryCause).toBe('reversão ao valor justo')
    expect(attribution.confidence).toBe('alta')
    expect(attribution.explanation).toContain('L2_FundamentalAnchor')
    expect(attribution.orderImbalance).toBe(28)
  })

  it('agrega múltiplos ticks preservando a camada dominante do candle', () => {
    const first = buildPriceAttribution({
      previousPrice: 3,
      enginePrice: 3.01,
      finalPrice: 3.01,
      agentImpact: 0,
      syntheticVolume: 5,
      pendingBuyVolume: 10,
      pendingSellVolume: 1,
      sessionType: 'TRADING',
      generatedAt: new Date('2026-06-05T12:00:00.000Z'),
      layerResults: [
        { layer: 'L2_FundamentalAnchor', deltaPrice: 0.01 },
      ],
    })
    const second = buildPriceAttribution({
      previousPrice: 3.01,
      enginePrice: 3.03,
      finalPrice: 3.03,
      agentImpact: 0,
      syntheticVolume: 7,
      pendingBuyVolume: 20,
      pendingSellVolume: 3,
      sessionType: 'TRADING',
      generatedAt: new Date('2026-06-05T12:00:02.000Z'),
      layerResults: [
        { layer: 'L4_OrderFlowImbalance', deltaPrice: 0.02 },
      ],
    })

    const merged = mergePriceAttributions([first, second], new Date('2026-06-05T12:00:02.000Z'))

    expect(merged?.previousPrice).toBe(3)
    expect(merged?.finalPrice).toBe(3.03)
    expect(merged?.primaryLayer).toBe('L4_OrderFlowImbalance')
    expect(merged?.syntheticVolume).toBe(12)
    expect(merged?.explanation).toContain('consolidou 2 ticks')
  })

  it('valida atribuicao v2 com eventos causais, flags fechadas e parser discriminado', () => {
    const attribution = buildPriceAttributionV2({
      previousPrice: 10,
      enginePrice: 10.4,
      finalPrice: 10.4,
      agentImpact: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 100,
      pendingSellVolume: 10,
      sessionType: 'TRADING',
      generatedAt: new Date('2026-06-06T12:00:00.000Z'),
      tickId: 'tick-1',
      tickStartedAt: new Date('2026-06-06T11:59:59.000Z'),
      tickEndedAt: new Date('2026-06-06T12:00:00.000Z'),
      orderFlowSnapshot: {
        openBuyQty: 100,
        openSellQty: 10,
        marketBuyQty: 0,
        marketSellQty: 0,
        orderCount: 2,
        snapshotTakenAt: '2026-06-06T11:59:59.000Z',
        orderSnapshotSource: 'DB',
        topOrderIds: ['ord-1', 'ord-2'],
        orderIdsTruncated: false,
        qualityFlags: [],
      },
      layerResults: [
        { layer: 'L4_OrderFlowImbalance', deltaPrice: 0.4, metadata: { userEmail: 'x@example.com', fairValue: 12 } },
      ],
    })

    expect(attribution.version).toBe(2)
    expect(attribution.tickCount).toBe(1)
    expect(attribution.causalEvents[0].type).toBe('ORDER_FLOW')
    expect(attribution.causalEvents[0].orderIds).toEqual(['ord-1', 'ord-2'])
    expect(JSON.stringify(attribution)).not.toContain('x@example.com')
    expect(parsePriceAttribution(attribution)).toMatchObject({ ok: true, evidenceGrade: 'DIRECT' })
  })

  it('degrada JSON invalido e versao desconhecida sem lancar excecao', () => {
    expect(parsePriceAttribution('{bad-json')).toMatchObject({
      ok: false,
      evidenceGrade: 'DEGRADED',
      qualityFlag: 'ATTRIBUTION_PARSE_FAILED',
    })
    expect(parsePriceAttribution({ version: 99 })).toMatchObject({
      ok: false,
      evidenceGrade: 'DEGRADED',
      qualityFlag: 'ATTRIBUTION_PARSE_FAILED',
    })
  })

  it('trunca payload acima de 64 KB preservando causa principal', () => {
    const attribution = buildPriceAttributionV2({
      previousPrice: 10,
      enginePrice: 10.5,
      finalPrice: 10.5,
      agentImpact: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      sessionType: 'TRADING',
      generatedAt: new Date('2026-06-06T12:00:00.000Z'),
      tickId: 'tick-big',
      layerResults: [
        { layer: 'L2_FundamentalAnchor', deltaPrice: 0.5, metadata: { note: 'x'.repeat(100_000), balance: 1000 } },
      ],
      inputSnapshot: {
        tickId: 'tick-big',
        assetId: 'asset-1',
        ticker: 'AAA3',
        startedAt: '2026-06-06T12:00:00.000Z',
        previousPrice: 10,
        pendingBuyVolume: 0,
        pendingSellVolume: 0,
        sessionType: 'TRADING',
        activeNewsImpacts: Array.from({ length: 30 }, (_, index) => ({
          newsId: `news-${index}`,
          title: 'x'.repeat(5000),
          magnitude: 0.1,
          durationTicks: 50,
          ticksRemaining: 50,
          qualityFlags: [],
        })),
      },
    })

    expect(attribution.primaryLayer).toBe('L2_FundamentalAnchor')
    expect(attribution.qualityFlags).toContain('ATTRIBUTION_TRUNCATED')
    expect(JSON.stringify(attribution)).not.toContain('1000')
  })
})
