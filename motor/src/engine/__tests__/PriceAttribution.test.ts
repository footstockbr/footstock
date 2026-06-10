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

  it('registra ajuste administrativo como causa primaria com evento ADMIN_ACTION e motivo', () => {
    const attribution = buildPriceAttributionV2({
      previousPrice: 10,
      enginePrice: 12.01,
      finalPrice: 12.01,
      agentImpact: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      sessionType: 'TRADING',
      generatedAt: new Date('2026-06-09T12:00:00.000Z'),
      tickId: 'tick-admin',
      layerResults: [
        { layer: 'L1_OrnsteinUhlenbeck', deltaPrice: 0.01 },
      ],
      adminAdjustments: [{
        previousPrice: 10,
        newPrice: 12,
        occurredAt: '2026-06-09T11:59:58.000Z',
        adminId: 'admin-1',
        reason: 'Correção de listagem do clube',
        actionType: 'ADJUST_PRICE',
      }],
    })

    expect(attribution.primaryLayer).toBe('AdminAdjustment')
    expect(attribution.primaryCause).toBe('ajuste administrativo de preço')
    const adminEvent = attribution.causalEvents.find((event) => event.type === 'ADMIN_ACTION')
    expect(adminEvent).toBeDefined()
    expect(adminEvent?.title).toBe('Correção de listagem do clube')
    expect(adminEvent?.occurredAt).toBe('2026-06-09T11:59:58.000Z')
    expect(attribution.primaryExplanation).toContain('ajuste administrativo de preço')
    expect(attribution.primaryExplanation).toContain('Correção de listagem do clube')
    expect(attribution.primaryExplanation).not.toContain('AdminAdjustment')
    // engineDelta nao pode absorver o salto admin (+2,00): so as camadas (+0,01).
    expect(attribution.engineDelta).toBeCloseTo(0.01, 8)
  })

  it('primaryExplanation descreve precos reais sem codigos de camada', () => {
    const attribution = buildPriceAttributionV2({
      previousPrice: 10,
      enginePrice: 10.4,
      finalPrice: 10.4,
      agentImpact: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      sessionType: 'TRADING',
      generatedAt: new Date('2026-06-09T12:00:00.000Z'),
      tickId: 'tick-friendly',
      layerResults: [
        { layer: 'L2_FundamentalAnchor', deltaPrice: 0.4, metadata: { fairValue: 12 } },
      ],
    })

    expect(attribution.primaryExplanation).toContain('FS$ 10,00')
    expect(attribution.primaryExplanation).toContain('FS$ 10,40')
    expect(attribution.primaryExplanation).toContain('reversão ao valor justo')
    expect(attribution.primaryExplanation).not.toMatch(/L\d+_/)
  })

  it('candle agregado com ticks em direcoes opostas avisa que a causa e saldo liquido', () => {
    const base = {
      agentImpact: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      sessionType: 'TRADING' as const,
    }
    const up = buildPriceAttributionV2({
      ...base,
      previousPrice: 10,
      enginePrice: 10.5,
      finalPrice: 10.5,
      generatedAt: new Date('2026-06-09T12:00:00.000Z'),
      tickId: 'tick-up',
      layerResults: [{ layer: 'L1_OrnsteinUhlenbeck', deltaPrice: 0.5 }],
    })
    const down = buildPriceAttributionV2({
      ...base,
      previousPrice: 10.5,
      enginePrice: 10.05,
      finalPrice: 10.05,
      generatedAt: new Date('2026-06-09T12:00:02.000Z'),
      tickId: 'tick-down',
      layerResults: [{ layer: 'L1_OrnsteinUhlenbeck', deltaPrice: -0.45 }],
    })

    const merged = mergePriceAttributions([up, down], new Date('2026-06-09T12:00:02.000Z'))

    expect(merged?.version).toBe(2)
    if (merged?.version === 2) {
      expect(merged.tickCount).toBe(2)
      expect(merged.caveatSentence).toContain('saldo liquido')
      expect(merged.primaryExplanation).not.toMatch(/L\d+_/)
      const primary = merged.layerContributions.find((item) => item.layer === 'L1_OrnsteinUhlenbeck')
      expect(primary?.metadata?.grossAbsDelta).toBeCloseTo(0.95, 8)
    }
  })

  it('merge preserva o evento ADMIN_ACTION mesmo quando o ajuste cai nos ticks finais (cap de 20 eventos)', () => {
    const manyLayers = [
      { layer: 'L1_OrnsteinUhlenbeck', deltaPrice: 0.01 },
      { layer: 'L2_FundamentalAnchor', deltaPrice: 0.008 },
      { layer: 'L3_GARCHLite', deltaPrice: 0.006 },
      { layer: 'L8_VelocityCap', deltaPrice: 0 },
      { layer: 'L9_DailyVolTarget', deltaPrice: 0 },
      { layer: 'L10_CircuitBreaker', deltaPrice: 0 },
    ]
    const ticks = Array.from({ length: 6 }, (_, index) => buildPriceAttributionV2({
      previousPrice: 10 + index * 0.02,
      enginePrice: 10 + (index + 1) * 0.02,
      finalPrice: 10 + (index + 1) * 0.02,
      agentImpact: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      sessionType: 'TRADING',
      generatedAt: new Date(`2026-06-09T12:00:0${index}.000Z`),
      tickId: `tick-${index}`,
      layerResults: manyLayers,
      // Ajuste admin apenas no penultimo tick — antes do fix, o slice cego em
      // ordem de tick derrubava este evento e o motivo sumia da explicacao.
      ...(index === 4
        ? {
            adminAdjustments: [{
              previousPrice: 10.08,
              newPrice: 12,
              occurredAt: '2026-06-09T12:00:04.000Z',
              reason: 'Reprecificação pós-auditoria',
              actionType: 'ADJUST_PRICE' as const,
            }],
          }
        : {}),
    }))

    const merged = mergePriceAttributions(ticks, new Date('2026-06-09T12:00:06.000Z'))

    expect(merged?.version).toBe(2)
    if (merged?.version === 2) {
      const adminEvent = merged.causalEvents.find((event) => event.type === 'ADMIN_ACTION')
      expect(adminEvent).toBeDefined()
      expect(adminEvent?.title).toBe('Reprecificação pós-auditoria')
      expect(merged.primaryLayer).toBe('AdminAdjustment')
      expect(merged.primaryExplanation).toContain('Reprecificação pós-auditoria')
      expect(merged.primaryEventId).toBe(adminEvent?.id)
    }
  })

  it('evento NEWS usa o metadata da L7 (noticia aplicada), nao o snapshot pos-calculo da fila', () => {
    const attribution = buildPriceAttributionV2({
      previousPrice: 10,
      enginePrice: 10.3,
      finalPrice: 10.3,
      agentImpact: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      sessionType: 'TRADING',
      generatedAt: new Date('2026-06-09T12:00:00.000Z'),
      tickId: 'tick-handoff',
      layerResults: [
        // L7 aplicou a noticia A neste tick (registrado no metadata)...
        { layer: 'L7_PressureQueue', deltaPrice: 0.3, metadata: { newsId: 'news-a', title: 'Noticia A aplicada' } },
      ],
      // ...mas a fila ja avancou: o snapshot pos-calculo aponta para a noticia B.
      activeNewsImpacts: [{
        newsId: 'news-b',
        title: 'Noticia B na fila',
        magnitude: 0.2,
        durationTicks: 50,
        ticksRemaining: 50,
        qualityFlags: [],
      }],
    })

    const newsEvent = attribution.causalEvents.find((event) => event.type === 'NEWS' && event.layer === 'L7_PressureQueue')
    expect(newsEvent?.newsId).toBe('news-a')
    expect(newsEvent?.title).toBe('Noticia A aplicada')
    expect(attribution.primaryExplanation).toContain('Noticia A aplicada')
    expect(attribution.primaryExplanation).not.toContain('Noticia B na fila')
  })

  it('camada primaria contraria ao movimento gera frase de direcao contraria, nao afirmacao falsa', () => {
    const attribution = buildPriceAttributionV2({
      previousPrice: 10,
      enginePrice: 10.2,
      finalPrice: 10.2,
      agentImpact: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      sessionType: 'TRADING',
      generatedAt: new Date('2026-06-09T12:00:00.000Z'),
      tickId: 'tick-oppose',
      layerResults: [
        { layer: 'L7_PressureQueue', deltaPrice: -0.5, metadata: { newsId: 'news-neg', title: 'Derrota dura fora de casa' } },
        { layer: 'L2_FundamentalAnchor', deltaPrice: 0.4 },
        { layer: 'L4_OrderFlowImbalance', deltaPrice: 0.3 },
      ],
    })

    expect(attribution.primaryLayer).toBe('L7_PressureQueue')
    expect(attribution.primaryExplanation).toContain('direção contrária')
    expect(attribution.primaryExplanation).not.toContain('impulsionado principalmente pela notícia')
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
