import {
  buildCause,
  buildEngineAttributionDiagnosticNotes,
  causeTypeFromAttribution,
  classifyEvidence,
  composeEngineExplanation,
  confidenceScore,
  eventTime,
  extractActionReason,
  humanizeEngineText,
  inWindow,
  isEngineAttribution,
  parseEngineAttribution,
  magnitudeFromPct,
  pct,
  type AdminActionEvidence,
  type EngineAttribution,
  type EngineAttributionV2,
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

  it('candle MOTOR sem attribution e sem evidencia vira falha operacional (owner ENGINE, nao frase generica)', () => {
    const classified = classifyEvidence({
      attributionParse: parseEngineAttribution(null),
      source: 'MOTOR',
      hasAttributionColumn: true,
      news: [],
      adminActions: [],
      orderFlow: { buyQuantity: 0, sellQuantity: 0, netQuantity: 0, orderCount: 0, averageExecutedPrice: null },
      fallbackCause: { confidence: 'baixa', causeType: 'MARKET_FLOW', explanation: 'fluxo de mercado com baixa confiança' },
    })

    expect(classified.evidenceGrade).toBe('DEGRADED')
    expect(classified.degradedOwner).toBe('ENGINE')
    expect(classified.primaryExplanation).toContain('Falha de rastro causal do motor')
    expect(classified.primaryExplanation).not.toContain('fluxo de mercado')
  })

  it('causeTypeFromAttribution deriva o tipo real da camada dominante', () => {
    const baseV2: EngineAttributionV2 = {
      version: 2,
      tickId: 'tick-1',
      tickCount: 1,
      tickStartedAt: '2026-06-09T12:00:00.000Z',
      tickEndedAt: '2026-06-09T12:00:01.000Z',
      primaryEventId: null,
      primaryCause: 'absorção de notícia',
      primaryLayer: 'L7_PressureQueue',
      confidence: 'alta',
      explanation: 'tecnico',
      primaryExplanation: 'humano',
      evidenceSentence: 'evidencia',
      caveatSentence: 'ressalva',
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
      causalEvents: [],
      appliedControls: [],
      qualityFlags: [],
      payloadBytes: 100,
      generatedAt: '2026-06-09T12:00:01.000Z',
    }

    expect(causeTypeFromAttribution(baseV2)).toBe('NEWS')
    expect(causeTypeFromAttribution({ ...baseV2, primaryLayer: 'AdminAdjustment' })).toBe('ADMIN_ACTION')
    expect(causeTypeFromAttribution({ ...baseV2, primaryLayer: 'L4_OrderFlowImbalance' })).toBe('MARKET_FLOW')
    expect(causeTypeFromAttribution({ ...baseV2, primaryLayer: 'L2_FundamentalAnchor' })).toBe('SIMULATED_ENGINE')
  })

  it('causeTypeFromAttribution ignora primaryEvent de camada diferente da primaria (fallback historico)', () => {
    const attribution: EngineAttributionV2 = {
      version: 2,
      tickId: 'tick-mismatch',
      tickCount: 6,
      tickStartedAt: '2026-06-09T12:00:00.000Z',
      tickEndedAt: '2026-06-09T12:00:06.000Z',
      // Payload merged historico: primaryEventId gravado com fallback
      // causalEvents[0], que e um evento NEWS de OUTRA camada.
      primaryEventId: 'event-news',
      primaryCause: 'oscilação natural do mercado simulado',
      primaryLayer: 'L1_OrnsteinUhlenbeck',
      confidence: 'alta',
      explanation: 'tecnico',
      primaryExplanation: 'humano',
      evidenceSentence: 'evidencia',
      caveatSentence: 'ressalva',
      previousPrice: 10,
      enginePrice: 10.1,
      finalPrice: 10.1,
      engineDelta: 0.1,
      agentImpactPct: 0,
      agentDelta: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      orderImbalance: 0,
      sessionType: 'TRADING',
      layerContributions: [
        { layer: 'L1_OrnsteinUhlenbeck', deltaPrice: 0.1, contributionPct: 90, direction: 'up' },
      ],
      causalEvents: [{
        id: 'event-news',
        type: 'NEWS',
        source: 'L7_PressureQueue',
        occurredAt: '2026-06-09T12:00:00.000Z',
        direction: 'up',
        magnitude: 0.01,
        layer: 'L7_PressureQueue',
        newsId: 'news-x',
        title: 'Noticia irrelevante para o movimento',
      }],
      appliedControls: [],
      qualityFlags: [],
      payloadBytes: 512,
      generatedAt: '2026-06-09T12:00:06.000Z',
    }

    expect(causeTypeFromAttribution(attribution)).toBe('SIMULATED_ENGINE')
  })

  it('acao com precos incongruentes ao candle vira contexto, nao causa confirmada', () => {
    const incongruentContext = {
      previousPrice: 12.01,
      newPrice: 12.05,
      absoluteChange: 0.04,
      percentageChange: 0.33,
      intraperiodRangePct: 0.4,
      volume: 100,
      volumeDelta: 5,
      sessionType: 'TRADING',
      orderFlow: { buyQuantity: 0, sellQuantity: 0, netQuantity: 0, orderCount: 0, averageExecutedPrice: null },
    }
    const drift = buildCause({
      direction: 'up',
      volumeDelta: 5,
      source: 'REAL',
      news: [],
      adminActions: [baseAction],
      context: incongruentContext,
    })
    expect(drift.causeType).toBe('ADMIN_ACTION')
    expect(drift.confidence).toBe('media')
    expect(drift.explanation).toContain('não casam com este candle')
    expect(drift.explanation).not.toContain('Variação compatível')

    const jumpContext = {
      ...incongruentContext,
      previousPrice: 10,
      newPrice: 11.02,
      absoluteChange: 1.02,
      percentageChange: 10.2,
    }
    const jump = buildCause({
      direction: 'up',
      volumeDelta: 5,
      source: 'REAL',
      news: [],
      adminActions: [baseAction],
      context: jumpContext,
    })
    expect(jump.confidence).toBe('alta')
    expect(jump.explanation).toContain('Variação compatível')
    expect(jump.explanation).toContain('FS$ 10,00')
    expect(jump.explanation).toContain('FS$ 11,00')
  })

  it('composeEngineExplanation nomeia a noticia real e nao emite codigos de camada', () => {
    const attribution: EngineAttributionV2 = {
      version: 2,
      tickId: 'tick-news',
      tickCount: 3,
      tickStartedAt: '2026-06-09T12:00:00.000Z',
      tickEndedAt: '2026-06-09T12:00:06.000Z',
      primaryEventId: 'event-news',
      primaryCause: 'absorção de notícia',
      primaryLayer: 'L7_PressureQueue',
      confidence: 'alta',
      explanation: 'tecnico com L7_PressureQueue',
      primaryExplanation: 'absorção de notícia: L7_PressureQueue aplicou +FS$ 0,30.',
      evidenceSentence: 'A evidencia direta e a noticia aplicada pela L7.',
      caveatSentence: 'Causalidade operacional.',
      previousPrice: 10,
      enginePrice: 10.3,
      finalPrice: 10.3,
      engineDelta: 0.3,
      agentImpactPct: 0,
      agentDelta: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      orderImbalance: 0,
      sessionType: 'TRADING',
      layerContributions: [
        { layer: 'L7_PressureQueue', deltaPrice: 0.3, contributionPct: 90, direction: 'up' },
        { layer: 'L1_OrnsteinUhlenbeck', deltaPrice: 0.02, contributionPct: 10, direction: 'up' },
      ],
      causalEvents: [{
        id: 'event-news',
        type: 'NEWS',
        source: 'L7_PressureQueue',
        occurredAt: '2026-06-09T12:00:00.000Z',
        direction: 'up',
        magnitude: 0.3,
        layer: 'L7_PressureQueue',
        newsId: 'news-9',
        title: 'Clube vence clássico e dispara no ranking',
        sentiment: 'BULLISH',
      }],
      appliedControls: [],
      qualityFlags: [],
      payloadBytes: 2048,
      generatedAt: '2026-06-09T12:00:06.000Z',
    }

    const text = composeEngineExplanation(attribution)
    expect(text).toContain('Clube vence clássico e dispara no ranking')
    expect(text).toContain('FS$ 10,00')
    expect(text).toContain('FS$ 10,30')
    expect(text).toContain('consolida 3 ticks')
    expect(text).not.toMatch(/L\d+_/)
    expect(text).not.toContain('AdminAdjustment')
  })

  it('classifyEvidence DIRECT recompoe explicacao rica e humaniza frases do motor', () => {
    const parsed = parseEngineAttribution({
      version: 2,
      tickId: 'tick-h',
      tickCount: 1,
      tickStartedAt: '2026-06-09T12:00:00.000Z',
      tickEndedAt: '2026-06-09T12:00:01.000Z',
      primaryEventId: 'event-1',
      primaryCause: 'oscilação natural do mercado simulado',
      primaryLayer: 'L1_OrnsteinUhlenbeck',
      confidence: 'alta',
      explanation: 'tecnico',
      primaryExplanation: 'oscilação: L1_OrnsteinUhlenbeck aplicou +FS$ 0,05.',
      evidenceSentence: 'A evidencia direta e a contribuicao L1_OrnsteinUhlenbeck gravada pelo motor.',
      caveatSentence: 'Causalidade operacional.',
      previousPrice: 5,
      enginePrice: 5.05,
      finalPrice: 5.05,
      engineDelta: 0.05,
      agentImpactPct: 0,
      agentDelta: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      orderImbalance: 0,
      sessionType: 'TRADING',
      layerContributions: [
        { layer: 'L1_OrnsteinUhlenbeck', deltaPrice: 0.05, contributionPct: 100, direction: 'up' },
      ],
      causalEvents: [{
        id: 'event-1',
        type: 'LAYER',
        source: 'L1_OrnsteinUhlenbeck',
        occurredAt: '2026-06-09T12:00:00.000Z',
        direction: 'up',
        magnitude: 0.05,
        layer: 'L1_OrnsteinUhlenbeck',
      }],
      appliedControls: [],
      qualityFlags: [],
      payloadBytes: 1024,
      generatedAt: '2026-06-09T12:00:01.000Z',
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
    expect(classified.primaryExplanation).toContain('FS$ 5,00')
    expect(classified.primaryExplanation).not.toMatch(/L\d+_/)
    expect(classified.evidenceSentence).not.toContain('L1_OrnsteinUhlenbeck')
    expect(classified.evidenceSentence).toContain('oscilação natural do mercado simulado')
  })

  it('noticia divergente e nomeada na explicacao em vez da frase generica', () => {
    const result = buildCause({
      direction: 'down',
      volumeDelta: 0,
      source: 'REAL',
      news: [baseNews],
      adminActions: [],
    })

    expect(result.causeType).toBe('NEWS')
    expect(result.confidence).toBe('baixa')
    expect(result.explanation).toContain('Clube anuncia patrocínio relevante')
    expect(result.explanation).toContain('queda')
    expect(result.explanation).not.toContain('não explica diretamente a direção da variação')
  })

  it('humanizeEngineText troca codigos de camada por nomes humanos', () => {
    expect(humanizeEngineText('agregacao de 6 tick(s) com L4_OrderFlowImbalance dominante'))
      .toBe('agregacao de 6 tick(s) com pressão acumulada do livro de ordens dominante')
  })

  it('candle MOTOR sem coluna attribution atribui owner MIGRATION', () => {
    const classified = classifyEvidence({
      attributionParse: parseEngineAttribution(null),
      source: 'MOTOR',
      hasAttributionColumn: false,
      news: [],
      adminActions: [],
      orderFlow: { buyQuantity: 0, sellQuantity: 0, netQuantity: 0, orderCount: 0, averageExecutedPrice: null },
      fallbackCause: { confidence: 'baixa', causeType: 'UNEXPLAINED', explanation: 'fallback' },
    })

    expect(classified.evidenceGrade).toBe('DEGRADED')
    expect(classified.degradedOwner).toBe('MIGRATION')
    expect(classified.qualityFlags).toContain('ATTRIBUTION_COLUMN_MISSING')
  })
})
