import {
  buildCause,
  buildEngineAttributionDiagnosticNotes,
  classifyEvidence,
  confidenceScore,
  eventTime,
  extractActionReason,
  inWindow,
  isEngineAttribution,
  parseEngineAttribution,
  magnitudeFromPct,
  pct,
  type AdminActionEvidence,
  type EngineAttribution,
  type NewsEvidence,
} from '@/lib/admin/value-analysis'

const baseNews: NewsEvidence = {
  id: 'news-1',
  title: 'Clube anuncia patrocínio relevante',
  source: 'feed',
  sentiment: 'BULLISH',
  impact: 'FINANCEIRA_CRITICA',
  occurredAt: '2026-06-05T12:00:00.000Z',
  href: '/admin/noticias?newsId=news-1',
}

const baseAction: AdminActionEvidence = {
  id: 'action-1',
  action: 'ADJUST_PRICE',
  reason: 'Correção manual após validação do motor',
  previousPrice: 10,
  newPrice: 11,
  occurredAt: '2026-06-05T12:05:00.000Z',
  href: '/admin/lgpd?tab=access-logs&actionId=action-1',
}

describe('value-analysis heuristics', () => {
  it('prioriza ação administrativa com preço explícito sobre notícia', () => {
    const result = buildCause({
      direction: 'up',
      volumeDelta: 100,
      source: 'REAL',
      news: [baseNews],
      adminActions: [baseAction],
    })

    expect(result.causeType).toBe('ADMIN_ACTION')
    expect(result.confidence).toBe('alta')
    expect(result.explanation).toContain('Correção manual')
  })

  it('atribui notícia quando sentimento combina com a direção do preço', () => {
    const result = buildCause({
      direction: 'up',
      volumeDelta: 0,
      source: 'REAL',
      news: [baseNews],
      adminActions: [],
    })

    expect(result.causeType).toBe('NEWS')
    expect(result.confidence).toBe('media')
  })

  it('marca notícia como evidência fraca quando sentimento diverge da direção', () => {
    const result = buildCause({
      direction: 'down',
      volumeDelta: 0,
      source: 'REAL',
      news: [baseNews],
      adminActions: [],
    })

    expect(result.causeType).toBe('NEWS')
    expect(result.confidence).toBe('baixa')
  })

  it('usa fluxo de mercado quando só há volume incremental real', () => {
    const result = buildCause({
      direction: 'down',
      volumeDelta: 500,
      source: 'REAL',
      news: [],
      adminActions: [],
    })

    expect(result.causeType).toBe('MARKET_FLOW')
    expect(confidenceScore(result.confidence, result.causeType)).toBe(35)
  })

  it('detalha fluxo de mercado com preço, ordens e saldo quando há contexto', () => {
    const result = buildCause({
      direction: 'down',
      volumeDelta: 22,
      source: 'REAL',
      news: [],
      adminActions: [],
      context: {
        previousPrice: 3.01,
        newPrice: 2.99,
        absoluteChange: -0.02,
        percentageChange: -0.67,
        intraperiodRangePct: 0.81,
        volume: 1200,
        volumeDelta: 22,
        sessionType: 'TRADING',
        orderFlow: {
          buyQuantity: 4,
          sellQuantity: 26,
          netQuantity: -22,
          orderCount: 3,
          averageExecutedPrice: 2.99,
        },
      },
    })

    expect(result.causeType).toBe('MARKET_FLOW')
    expect(result.confidence).toBe('media')
    expect(result.explanation).toContain('FS$ 3,01 para FS$ 2,99')
    expect(result.explanation).toContain('saldo líquido -22')
    expect(result.explanation).toContain('pressão vendedora acompanha a direção')
  })

  it('usa motor de precificação quando fonte não é REAL e não há evidência direta', () => {
    const result = buildCause({
      direction: 'up',
      volumeDelta: 0,
      source: 'GBM',
      news: [],
      adminActions: [],
    })

    expect(result.causeType).toBe('SIMULATED_ENGINE')
    expect(result.confidence).toBe('media')
  })

  it('explicita ausência de causa registrada', () => {
    const result = buildCause({
      direction: 'up',
      volumeDelta: 0,
      source: 'REAL',
      news: [],
      adminActions: [],
    })

    expect(result.causeType).toBe('UNEXPLAINED')
    expect(confidenceScore(result.confidence, result.causeType)).toBe(25)
  })

  it('calcula magnitude, percentual e janela temporal', () => {
    expect(pct(10, 11)).toBe(10)
    expect(magnitudeFromPct(0.2)).toBe('baixa')
    expect(magnitudeFromPct(2.5)).toBe('alta')
    expect(inWindow(new Date('2026-06-05T12:00:00Z'), new Date('2026-06-05T11:00:00Z'), new Date('2026-06-05T13:00:00Z'))).toBe(true)
  })

  it('usa publishedAt como horário do evento quando disponível', () => {
    const date = eventTime({
      createdAt: new Date('2026-06-05T09:00:00Z'),
      publishedAt: new Date('2026-06-05T12:00:00Z'),
    })

    expect(date.toISOString()).toBe('2026-06-05T12:00:00.000Z')
  })

  it('extrai razão de details quando reason direto está ausente', () => {
    expect(extractActionReason({ reason: null, details: { payload: { reason: 'Motivo no payload' } } })).toBe('Motivo no payload')
  })

  it('reconhece atribuição do motor e gera notas autoritativas', () => {
    const attribution: EngineAttribution = {
      version: 1,
      primaryCause: 'reversão ao valor justo',
      primaryLayer: 'L2_FundamentalAnchor',
      confidence: 'alta',
      explanation: 'O preço mudou porque L2 foi dominante.',
      previousPrice: 3,
      enginePrice: 3.02,
      finalPrice: 3.01,
      engineDelta: 0.02,
      agentImpactPct: -0.1,
      agentDelta: -0.01,
      syntheticVolume: 12,
      pendingBuyVolume: 20,
      pendingSellVolume: 5,
      orderImbalance: 15,
      sessionType: 'TRADING',
      layerContributions: [
        {
          layer: 'L2_FundamentalAnchor',
          deltaPrice: 0.02,
          contributionPct: 80,
          direction: 'up',
        },
      ],
      appliedControls: ['L8_VelocityCap'],
      generatedAt: '2026-06-05T12:00:00.000Z',
    }

    expect(isEngineAttribution(attribution)).toBe(true)
    const notes = buildEngineAttributionDiagnosticNotes(attribution)
    expect(notes.join(' ')).toContain('reversão ao valor justo')
    expect(notes.join(' ')).toContain('L2_FundamentalAnchor')
  })

  it('classifica v2 valida como DIRECT com evidencia direta', () => {
    const parsed = parseEngineAttribution({
      version: 2,
      tickId: 'tick-1',
      tickCount: 1,
      tickStartedAt: '2026-06-06T12:00:00.000Z',
      tickEndedAt: '2026-06-06T12:00:01.000Z',
      primaryEventId: 'event-1',
      primaryCause: 'absorção de notícia',
      primaryLayer: 'L7_PressureQueue',
      confidence: 'alta',
      explanation: 'Notícia aplicada pelo motor.',
      primaryExplanation: 'Notícia direta.',
      evidenceSentence: 'newsId news-1 gravado no tick.',
      caveatSentence: 'Causalidade operacional.',
      previousPrice: 10,
      enginePrice: 10.2,
      finalPrice: 10.2,
      engineDelta: 0.2,
      agentImpactPct: 0,
      agentDelta: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      orderImbalance: 0,
      sessionType: 'TRADING',
      layerContributions: [],
      causalEvents: [{
        id: 'event-1',
        type: 'NEWS',
        source: 'L7_PressureQueue',
        occurredAt: '2026-06-06T12:00:00.000Z',
        direction: 'up',
        magnitude: 0.2,
        newsId: 'news-1',
        title: 'Título da notícia',
      }],
      appliedControls: [],
      qualityFlags: [],
      payloadBytes: 1024,
      generatedAt: '2026-06-06T12:00:01.000Z',
    })

    const classified = classifyEvidence({
      attributionParse: parsed,
      source: 'MOTOR',
      hasAttributionColumn: true,
      news: [],
      adminActions: [],
      orderFlow: { buyQuantity: 0, sellQuantity: 0, netQuantity: 0, orderCount: 0, averageExecutedPrice: null },
      fallbackCause: { confidence: 'baixa', causeType: 'UNEXPLAINED', explanation: 'fallback' },
    })

    expect(classified.evidenceGrade).toBe('DIRECT')
    expect(classified.directEvidence[0].eventId).toBe('news-1')
    expect(classified.confidence).toBe('alta')
  })

  it('degrada attribution JSON invalida sem HTTP 500 conceitual', () => {
    const parsed = parseEngineAttribution('{broken')
    expect(parsed).toMatchObject({
      ok: false,
      evidenceGrade: 'DEGRADED',
      qualityFlag: 'ATTRIBUTION_PARSE_FAILED',
    })
  })

  it('limita correlacao temporal a confidenceScore <= 65', () => {
    const classified = classifyEvidence({
      attributionParse: parseEngineAttribution(null),
      source: 'MOTOR',
      hasAttributionColumn: true,
      news: [baseNews],
      adminActions: [],
      orderFlow: { buyQuantity: 0, sellQuantity: 0, netQuantity: 0, orderCount: 0, averageExecutedPrice: null },
      fallbackCause: { confidence: 'alta', causeType: 'NEWS', explanation: 'fallback correlacional' },
    })

    expect(classified.evidenceGrade).toBe('CORRELATED')
    expect(classified.confidence).toBe('media')
    expect(classified.confidenceScore).toBeLessThanOrEqual(65)
  })

  it('rotula GBM sem attribution como sintetico degradado', () => {
    const classified = classifyEvidence({
      attributionParse: parseEngineAttribution(null),
      source: 'GBM',
      hasAttributionColumn: true,
      news: [],
      adminActions: [],
      orderFlow: { buyQuantity: 0, sellQuantity: 0, netQuantity: 0, orderCount: 0, averageExecutedPrice: null },
      fallbackCause: { confidence: 'media', causeType: 'SIMULATED_ENGINE', explanation: 'gbm' },
    })

    expect(classified.evidenceGrade).toBe('DEGRADED')
    expect(classified.qualityFlags).toContain('SYNTHETIC_HISTORY')
    expect(classified.degradedReason).toContain('GBM')
  })
})
