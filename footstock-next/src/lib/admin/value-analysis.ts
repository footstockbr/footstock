export type CauseType =
  | 'ADMIN_ACTION'
  | 'NEWS'
  | 'MARKET_FLOW'
  | 'SIMULATED_ENGINE'
  | 'UNEXPLAINED'

export type Confidence = 'alta' | 'media' | 'baixa'
export type MovementMagnitude = 'neutra' | 'baixa' | 'moderada' | 'alta' | 'critica'
export type EvidenceGrade = 'DIRECT' | 'CORRELATED' | 'DEGRADED'
export type QualityFlag =
  | 'ATTRIBUTION_COLUMN_MISSING'
  | 'ATTRIBUTION_PERSIST_FAILED'
  | 'ATTRIBUTION_PARSE_FAILED'
  | 'ATTRIBUTION_TRUNCATED'
  | 'NEWS_WITHOUT_ID'
  | 'NEWS_QUEUE_AGGREGATED'
  | 'ORDER_FLOW_SNAPSHOT_UNAVAILABLE'
  | 'ORDER_FLOW_INELIGIBLE_ONLY'
  | 'LEGACY_BACKFILL'
  | 'SYNTHETIC_HISTORY'
  | 'UNKNOWN_DEGRADED_REASON'

export const QUALITY_FLAGS: readonly QualityFlag[] = [
  'ATTRIBUTION_COLUMN_MISSING',
  'ATTRIBUTION_PERSIST_FAILED',
  'ATTRIBUTION_PARSE_FAILED',
  'ATTRIBUTION_TRUNCATED',
  'NEWS_WITHOUT_ID',
  'NEWS_QUEUE_AGGREGATED',
  'ORDER_FLOW_SNAPSHOT_UNAVAILABLE',
  'ORDER_FLOW_INELIGIBLE_ONLY',
  'LEGACY_BACKFILL',
  'SYNTHETIC_HISTORY',
  'UNKNOWN_DEGRADED_REASON',
] as const

const QUALITY_FLAG_SET = new Set<string>(QUALITY_FLAGS)

export const CAUSE_LABELS_FOR_API: Record<CauseType, string> = {
  ADMIN_ACTION: 'ação administrativa',
  NEWS: 'notícia vinculada',
  MARKET_FLOW: 'fluxo de negociação',
  SIMULATED_ENGINE: 'motor de precificação',
  UNEXPLAINED: 'sem causa registrada',
}

export type NewsEvidence = {
  id: string
  title: string
  source: string | null
  sentiment: string
  impact: string
  occurredAt: string
  href: string
}

export type AdminActionEvidence = {
  id: string
  action: string
  reason: string | null
  previousPrice: number | null
  newPrice: number | null
  occurredAt: string
  href: string
}

export type OrderFlowEvidence = {
  buyQuantity: number
  sellQuantity: number
  netQuantity: number
  orderCount: number
  averageExecutedPrice: number | null
}

export type EngineLayerContribution = {
  layer: string
  deltaPrice: number
  contributionPct: number
  direction: 'up' | 'down' | 'neutral'
  metadata?: Record<string, number | string | boolean>
}

export type EngineAttribution = {
  version: 1
  primaryCause: string
  primaryLayer: string | null
  confidence: Confidence
  explanation: string
  previousPrice: number
  enginePrice: number
  finalPrice: number
  engineDelta: number
  agentImpactPct: number
  agentDelta: number
  syntheticVolume: number
  pendingBuyVolume: number
  pendingSellVolume: number
  orderImbalance: number
  sessionType: string
  layerContributions: EngineLayerContribution[]
  appliedControls: string[]
  generatedAt: string
}

export type CausalEvent = {
  id: string
  type: 'NEWS' | 'ADMIN_ACTION' | 'ORDER_FLOW' | 'LAYER' | 'CONTROL' | 'SYNTHETIC_AGENT' | 'CORRELATION' | 'NUDGE'
  source: string
  occurredAt: string
  direction: 'up' | 'down' | 'neutral'
  magnitude: number
  layer?: string
  newsId?: string
  title?: string
  impactCategory?: string
  sentiment?: number | string
  orderIds?: string[]
  orderIdsTruncated?: boolean
  reasonCode?: string
  metadata?: Record<string, number | string | boolean>
}

export type EngineAttributionV2 = Omit<EngineAttribution, 'version'> & {
  version: 2
  tickId: string
  tickCount: number
  tickStartedAt: string
  tickEndedAt: string
  primaryEventId: string | null
  primaryExplanation: string
  evidenceSentence: string
  caveatSentence: string
  causalEvents: CausalEvent[]
  qualityFlags: QualityFlag[]
  payloadBytes: number
}

export type AnyEngineAttribution = EngineAttribution | EngineAttributionV2

export type AttributionParseResult =
  | { ok: true; value: AnyEngineAttribution; evidenceGrade: 'DIRECT'; qualityFlags: QualityFlag[] }
  | { ok: false; reason: string; qualityFlag: QualityFlag; evidenceGrade: 'DEGRADED'; qualityFlags: QualityFlag[] }

export type DirectEvidence = {
  type: CausalEvent['type']
  label: string
  eventId: string
  source: string
  occurredAt: string
}

export type CorrelatedEvidence = {
  type: 'NEWS' | 'ADMIN_ACTION' | 'ORDER_FLOW'
  label: string
  eventId?: string
  occurredAt?: string
  confidenceScore: number
}

export type EvidenceClassification = {
  evidenceGrade: EvidenceGrade
  qualityFlags: QualityFlag[]
  directEvidence: DirectEvidence[]
  correlatedEvidence: CorrelatedEvidence[]
  degradedReason: string | null
  degradedOwner: 'MIGRATION' | 'ENGINE' | 'ORDER_FLOW' | 'NEWS_PIPELINE' | 'API_PARSER' | 'BACKFILL' | 'UNKNOWN' | null
  primaryExplanation: string
  evidenceSentence: string
  caveatSentence: string
  confidence: Confidence
  confidenceScore: number
}

export type MovementContext = {
  previousPrice: number
  newPrice: number
  absoluteChange: number
  percentageChange: number
  intraperiodRangePct: number
  volume: number
  volumeDelta: number
  sessionType: string
  orderFlow: OrderFlowEvidence
  motor?: {
    cluster: string
    sigma: number
    theta: number
    ofiRho: number
    velocityCapPct: number
  }
}

function validQualityFlags(flags: unknown): QualityFlag[] | null {
  if (!Array.isArray(flags)) return null
  const out: QualityFlag[] = []
  for (const flag of flags) {
    if (typeof flag !== 'string' || !QUALITY_FLAG_SET.has(flag)) return null
    out.push(flag as QualityFlag)
  }
  return [...new Set(out)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isEngineAttribution(value: unknown): value is AnyEngineAttribution {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (
    record.version === 1 &&
    typeof record.primaryCause === 'string' &&
    typeof record.explanation === 'string' &&
    Array.isArray(record.layerContributions)
  ) return true
  return (
    record.version === 2 &&
    typeof record.tickId === 'string' &&
    typeof record.tickCount === 'number' &&
    typeof record.tickStartedAt === 'string' &&
    typeof record.tickEndedAt === 'string' &&
    typeof record.primaryCause === 'string' &&
    Array.isArray(record.causalEvents) &&
    validQualityFlags(record.qualityFlags) !== null
  )
}

export function parseEngineAttribution(value: unknown): AttributionParseResult {
  if (value === null || value === undefined) {
    return {
      ok: false,
      reason: 'ATTRIBUTION_NULL',
      qualityFlag: 'UNKNOWN_DEGRADED_REASON',
      evidenceGrade: 'DEGRADED',
      qualityFlags: ['UNKNOWN_DEGRADED_REASON'],
    }
  }
  let candidate = value
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value)
    } catch {
      return {
        ok: false,
        reason: 'ATTRIBUTION_PARSE_FAILED',
        qualityFlag: 'ATTRIBUTION_PARSE_FAILED',
        evidenceGrade: 'DEGRADED',
        qualityFlags: ['ATTRIBUTION_PARSE_FAILED'],
      }
    }
  }
  if (isEngineAttribution(candidate)) {
    return {
      ok: true,
      value: candidate,
      evidenceGrade: 'DIRECT',
      qualityFlags: candidate.version === 2 ? candidate.qualityFlags : [],
    }
  }
  if (isRecord(candidate) && typeof candidate.version === 'number' && candidate.version !== 1 && candidate.version !== 2) {
    return {
      ok: false,
      reason: `UNSUPPORTED_ATTRIBUTION_VERSION_${candidate.version}`,
      qualityFlag: 'ATTRIBUTION_PARSE_FAILED',
      evidenceGrade: 'DEGRADED',
      qualityFlags: ['ATTRIBUTION_PARSE_FAILED'],
    }
  }
  return {
    ok: false,
    reason: 'ATTRIBUTION_SCHEMA_INVALID',
    qualityFlag: 'ATTRIBUTION_PARSE_FAILED',
    evidenceGrade: 'DEGRADED',
    qualityFlags: ['ATTRIBUTION_PARSE_FAILED'],
  }
}

export function buildEngineAttributionDiagnosticNotes(attribution: AnyEngineAttribution): string[] {
  const notes: string[] = []
  const primaryLayer = attribution.primaryLayer ?? 'nenhuma camada dominante'
  notes.push(`Atribuição gravada no tick pelo motor: causa principal "${attribution.primaryCause}" via ${primaryLayer}.`)
  notes.push(`Preço base ${money(attribution.previousPrice)}, preço após camadas ${money(attribution.enginePrice)}, preço final ${money(attribution.finalPrice)}.`)
  notes.push(`Impacto dos agentes: ${signedPct(attribution.agentImpactPct)} e volume sintético de ${attribution.syntheticVolume.toLocaleString('pt-BR')} unidade(s).`)
  notes.push(`Book no tick: ${attribution.pendingBuyVolume.toLocaleString('pt-BR')} compra(s), ${attribution.pendingSellVolume.toLocaleString('pt-BR')} venda(s), saldo ${attribution.orderImbalance.toLocaleString('pt-BR')}.`)

  const topLayers = attribution.layerContributions
    .filter((layer) => Math.abs(layer.deltaPrice) > 0)
    .slice(0, 4)
    .map((layer) => `${layer.layer} ${layer.deltaPrice > 0 ? '+' : ''}${money(layer.deltaPrice)} (${round2(layer.contributionPct)}%)`)

  if (topLayers.length > 0) {
    notes.push(`Principais contribuições: ${topLayers.join('; ')}.`)
  }

  if (attribution.appliedControls.length > 0) {
    notes.push(`Controles aplicados no tick: ${attribution.appliedControls.join(', ')}.`)
  }
  if (attribution.version === 2) {
    notes.push(`EvidenceGrade DIRECT: ${attribution.causalEvents.length} evento(s) causal(is), tickId ${attribution.tickId}, payload ${attribution.payloadBytes} bytes.`)
    if (attribution.qualityFlags.length > 0) notes.push(`Flags de qualidade: ${attribution.qualityFlags.join(', ')}.`)
  }

  return notes
}

function directEvidenceFromAttribution(attribution: AnyEngineAttribution): DirectEvidence[] {
  if (attribution.version === 1) {
    return [{
      type: 'LAYER',
      label: attribution.primaryCause,
      eventId: attribution.primaryLayer ?? attribution.generatedAt,
      source: attribution.primaryLayer ?? 'PriceAttributionV1',
      occurredAt: attribution.generatedAt,
    }]
  }
  return attribution.causalEvents
    .filter((event) => event.magnitude > 0)
    .slice(0, 8)
    .map((event) => ({
      type: event.type,
      label: event.title ?? event.layer ?? event.source,
      eventId: event.newsId ?? event.id,
      source: event.source,
      occurredAt: event.occurredAt,
    }))
}

// Sources gerados pelo motor de precificacao. Um candle desses DEVERIA carregar
// uma atribuicao causal direta; a ausencia e defeito operacional (motor/persistencia),
// nao "causa desconhecida de mercado".
const ENGINE_SOURCES = new Set<string>(['MOTOR'])

export function isEngineSource(source: string): boolean {
  return ENGINE_SOURCES.has(source)
}

function sourceQualityFlag(source: string, hasAttributionColumn: boolean): QualityFlag {
  if (!hasAttributionColumn) return 'ATTRIBUTION_COLUMN_MISSING'
  if (source === 'GBM') return 'SYNTHETIC_HISTORY'
  return 'UNKNOWN_DEGRADED_REASON'
}

// Mensagem honesta para candle do motor sem rastro causal aceito: descreve o
// defeito operacional (parser/coluna/flags) em vez de inferir uma causa de mercado.
function buildEngineTraceFailureExplanation(opts: {
  source: string
  parseReason: string
  hasAttributionColumn: boolean
  qualityFlags: QualityFlag[]
}): string {
  const columnState = opts.hasAttributionColumn
    ? 'coluna attribution presente'
    : 'coluna attribution ausente'
  const flags = opts.qualityFlags.length > 0 ? opts.qualityFlags.join(', ') : 'nenhuma'
  return (
    `Falha de rastro causal do motor: o candle source=${opts.source} nao carrega atribuicao aceita pelo parser ` +
    `(motivo: ${opts.parseReason}; ${columnState}; flags: ${flags}). ` +
    `Este candle foi gerado pelo motor e deveria registrar a causa direta da variacao; ` +
    `trate como defeito operacional de captura/persistencia, nao como causa de mercado. ` +
    `Nenhuma causa real e inferida para este candle.`
  )
}

export function classifyEvidence(params: {
  attributionParse: AttributionParseResult
  source: string
  hasAttributionColumn: boolean
  news: NewsEvidence[]
  adminActions: AdminActionEvidence[]
  orderFlow: OrderFlowEvidence
  fallbackCause: { confidence: Confidence; causeType: CauseType; explanation: string }
}): EvidenceClassification {
  if (params.attributionParse.ok) {
    const attribution = params.attributionParse.value
    const directEvidence = directEvidenceFromAttribution(attribution)
    return {
      evidenceGrade: directEvidence.length > 0 ? 'DIRECT' : 'DEGRADED',
      qualityFlags: params.attributionParse.qualityFlags,
      directEvidence,
      correlatedEvidence: [],
      degradedReason: directEvidence.length > 0 ? null : 'Attribution valida sem evento causal material.',
      degradedOwner: directEvidence.length > 0 ? null : 'ENGINE',
      primaryExplanation: attribution.version === 2 ? attribution.primaryExplanation : attribution.explanation,
      evidenceSentence: attribution.version === 2 ? attribution.evidenceSentence : `Rastro direto gravado pelo motor em ${attribution.generatedAt}.`,
      caveatSentence: attribution.version === 2 ? attribution.caveatSentence : 'Atribuicao v1 explica camada dominante, mas nao carrega eventos causais detalhados.',
      confidence: 'alta',
      confidenceScore: 90,
    }
  }

  const correlatedEvidence: CorrelatedEvidence[] = [
    ...params.news.slice(0, 3).map((item) => ({
      type: 'NEWS' as const,
      label: item.title,
      eventId: item.id,
      occurredAt: item.occurredAt,
      confidenceScore: 60,
    })),
    ...params.adminActions.slice(0, 3).map((item) => ({
      type: 'ADMIN_ACTION' as const,
      label: item.action,
      eventId: item.id,
      occurredAt: item.occurredAt,
      confidenceScore: 60,
    })),
  ]
  if (params.orderFlow.orderCount > 0) {
    correlatedEvidence.push({
      type: 'ORDER_FLOW',
      label: `${params.orderFlow.orderCount} ordem(ns) executada(s) na janela`,
      confidenceScore: 55,
    })
  }

  if (correlatedEvidence.length > 0 && params.source !== 'GBM') {
    const engineSource = isEngineSource(params.source)
    return {
      evidenceGrade: 'CORRELATED',
      qualityFlags: engineSource
        ? [...new Set([params.attributionParse.qualityFlag, sourceQualityFlag(params.source, params.hasAttributionColumn)])]
        : [params.attributionParse.qualityFlag],
      directEvidence: [],
      correlatedEvidence,
      degradedReason: null,
      degradedOwner: engineSource ? (params.hasAttributionColumn ? 'ENGINE' : 'MIGRATION') : null,
      primaryExplanation: params.fallbackCause.explanation,
      evidenceSentence: 'Ha correlacao temporal com eventos proximos, mas nenhum rastro causal direto foi aceito.',
      caveatSentence: engineSource
        ? 'Candle do motor sem rastro causal direto: evidencia apenas correlacional/pos-preco. Investigar captura/persistencia de attribution.'
        : 'Nao apresentar como causa confirmada; limite operacional de confianca media/baixa.',
      confidence: params.fallbackCause.confidence === 'alta' ? 'media' : params.fallbackCause.confidence,
      confidenceScore: Math.min(65, confidenceScore(params.fallbackCause.confidence, params.fallbackCause.causeType)),
    }
  }

  // Candle do motor sem atribuicao aceita e sem evidencia correlacionada: caso que
  // antes caia na frase generica de "fluxo de mercado com baixa confianca". Agora
  // reportamos o defeito operacional com owner especifico, nunca UNKNOWN.
  if (isEngineSource(params.source) && !params.attributionParse.ok) {
    const qualityFlags = [...new Set<QualityFlag>([
      params.attributionParse.qualityFlag,
      sourceQualityFlag(params.source, params.hasAttributionColumn),
    ])]
    return {
      evidenceGrade: 'DEGRADED',
      qualityFlags,
      directEvidence: [],
      correlatedEvidence: [],
      degradedReason: `Candle source=${params.source} sem atribuicao aceita (${params.attributionParse.reason}).`,
      degradedOwner: params.hasAttributionColumn ? 'ENGINE' : 'MIGRATION',
      primaryExplanation: buildEngineTraceFailureExplanation({
        source: params.source,
        parseReason: params.attributionParse.reason,
        hasAttributionColumn: params.hasAttributionColumn,
        qualityFlags,
      }),
      evidenceSentence: 'Nenhum rastro causal direto do motor foi aceito para este candle.',
      caveatSentence: 'Defeito operacional: nao usar como causa confirmada; abrir investigacao de captura/persistencia de attribution.',
      confidence: 'baixa',
      confidenceScore: 20,
    }
  }

  const flag = sourceQualityFlag(params.source, params.hasAttributionColumn)
  return {
    evidenceGrade: 'DEGRADED',
    qualityFlags: [...new Set([params.attributionParse.qualityFlag, flag])],
    directEvidence: [],
    correlatedEvidence: [],
    degradedReason: params.source === 'GBM'
      ? 'Historico sintetico GBM sem rastro causal real de mercado.'
      : 'Nao ha rastro causal auditavel para este movimento.',
    degradedOwner: flag === 'ATTRIBUTION_COLUMN_MISSING' ? 'MIGRATION' : flag === 'SYNTHETIC_HISTORY' ? 'BACKFILL' : 'UNKNOWN',
    primaryExplanation: params.source === 'GBM'
      ? 'Candle sintetico gerado por simulacao; nao ha causa operacional direta de mercado.'
      : params.fallbackCause.explanation,
    evidenceSentence: 'Nenhuma evidencia direta foi gravada no candle.',
    caveatSentence: 'Movimento degradado: use apenas para diagnostico operacional, nao como causa confirmada.',
    confidence: 'baixa',
    confidenceScore: 25,
  }
}

export function pct(previous: number, current: number): number {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 10000) / 100
}

export function magnitudeFromPct(value: number): MovementMagnitude {
  const abs = Math.abs(value)
  if (abs === 0) return 'neutra'
  if (abs < 0.5) return 'baixa'
  if (abs < 2) return 'moderada'
  if (abs < 5) return 'alta'
  return 'critica'
}

export function confidenceScore(confidence: Confidence, causeType: CauseType): number {
  const base = confidence === 'alta' ? 90 : confidence === 'media' ? 65 : 35
  if (causeType === 'UNEXPLAINED') return Math.min(base, 25)
  if (causeType === 'MARKET_FLOW') return Math.min(base, 45)
  return base
}

export function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = average(values)
  const variance = average(values.map((value) => (value - mean) ** 2))
  return Math.sqrt(variance)
}

export function extractActionReason(action: { reason: string | null; details: unknown }): string | null {
  if (action.reason) return action.reason
  if (!action.details || typeof action.details !== 'object') return null
  const details = action.details as Record<string, unknown>
  const detailReason = details.reason
  if (typeof detailReason === 'string') return detailReason
  const payload = details.payload
  if (payload && typeof payload === 'object') {
    const payloadReason = (payload as Record<string, unknown>).reason
    if (typeof payloadReason === 'string') return payloadReason
  }
  return null
}

export function eventTime(news: { publishedAt: Date | null; createdAt: Date }): Date {
  return news.publishedAt ?? news.createdAt
}

export function inWindow(date: Date, start: Date, end: Date): boolean {
  const time = date.getTime()
  return time >= start.getTime() && time <= end.getTime()
}

export function sentimentMatchesDirection(sentiment: string, direction: 'up' | 'down'): boolean {
  return (
    (sentiment === 'BULLISH' && direction === 'up') ||
    (sentiment === 'BEARISH' && direction === 'down') ||
    sentiment === 'NEUTRAL'
  )
}

function money(value: number): string {
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function signedPct(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${round2(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function directionLabel(direction: 'up' | 'down'): string {
  return direction === 'up' ? 'alta' : 'queda'
}

function orderFlowSummary(orderFlow: OrderFlowEvidence): string {
  if (orderFlow.orderCount === 0) {
    return 'nenhuma ordem preenchida foi encontrada exatamente na janela desse candle'
  }

  const dominantSide = orderFlow.netQuantity > 0
    ? 'compradora'
    : orderFlow.netQuantity < 0
      ? 'vendedora'
      : 'equilibrada'
  const averagePrice = orderFlow.averageExecutedPrice === null
    ? ''
    : `, com preço médio executado de ${money(orderFlow.averageExecutedPrice)}`

  return `${orderFlow.orderCount} ordem(ns) preenchida(s), ${orderFlow.buyQuantity.toLocaleString('pt-BR')} unidade(s) compradas e ${orderFlow.sellQuantity.toLocaleString('pt-BR')} vendida(s), saldo líquido ${orderFlow.netQuantity.toLocaleString('pt-BR')} e pressão ${dominantSide}${averagePrice}`
}

function buildMarketFlowExplanation(direction: 'up' | 'down', context: MovementContext): string {
  const expectedPressure = direction === 'up' ? 'compradora' : 'vendedora'
  const oppositePressure = direction === 'up' ? 'vendedora' : 'compradora'
  const hasOrderFlow = context.orderFlow.orderCount > 0
  const netMatchesDirection =
    (direction === 'up' && context.orderFlow.netQuantity > 0) ||
    (direction === 'down' && context.orderFlow.netQuantity < 0)
  const netOpposesDirection =
    (direction === 'up' && context.orderFlow.netQuantity < 0) ||
    (direction === 'down' && context.orderFlow.netQuantity > 0)

  const base =
    `O preço teve ${directionLabel(direction)} de ${money(context.previousPrice)} para ${money(context.newPrice)} ` +
    `(${signedPct(context.percentageChange)}, ${money(context.absoluteChange)}), com range interno de ` +
    `${signedPct(context.intraperiodRangePct).replace('+', '')} e acréscimo de volume de ` +
    `${context.volumeDelta.toLocaleString('pt-BR')} unidade(s).`

  if (!hasOrderFlow) {
    return `${base} Não houve notícia nem ação administrativa na janela. Não há atribuição causal do motor para este candle e nenhuma ordem preenchida foi registrada no intervalo (lembrando que ordens preenchem ao preço já calculado, ou seja, são evidência pós-preço e não causa direta). Sem o rastro do motor, a causa direta não é auditável; o movimento fica como não confirmado e deve ser tratado com baixa confiança.`
  }

  if (netMatchesDirection) {
    return `${base} Não houve notícia nem ação administrativa na janela. O livro de ordens do intervalo mostra ${orderFlowSummary(context.orderFlow)}. Como a pressão ${expectedPressure} acompanha a direção da variação, a causa mais provável é fluxo de negociação dos usuários absorvido pelo motor de preço.`
  }

  if (netOpposesDirection) {
    return `${base} Não houve notícia nem ação administrativa na janela. O livro de ordens mostra ${orderFlowSummary(context.orderFlow)}, ou seja, pressão ${oppositePressure} contra a direção final do preço. Isso indica que a variação provavelmente não veio só do saldo líquido de ordens; o candle pode ter sido influenciado por spread, reversão ao valor justo, OFI acumulado ou agregação de múltiplos ticks.`
  }

  return `${base} Não houve notícia nem ação administrativa na janela. O livro de ordens mostra ${orderFlowSummary(context.orderFlow)}. Como o saldo líquido ficou equilibrado, a variação parece pequena e compatível com microestrutura do mercado: spread, arredondamento, execução em preços diferentes e ajuste incremental do motor.`
}

export function buildCause(params: {
  direction: 'up' | 'down'
  volumeDelta: number
  source: string
  news: NewsEvidence[]
  adminActions: AdminActionEvidence[]
  context?: MovementContext
}): { causeType: CauseType; causeLabel: string; confidence: Confidence; explanation: string } {
  const { direction, volumeDelta, source, news, adminActions, context } = params

  const explicitPriceAction = adminActions.find((action) => action.previousPrice !== null || action.newPrice !== null)
  if (explicitPriceAction) {
    return {
      causeType: 'ADMIN_ACTION',
      causeLabel: 'Ajuste administrativo',
      confidence: 'alta',
      explanation: explicitPriceAction.reason
        ? `Variação associada a ação administrativa ${explicitPriceAction.action}: ${explicitPriceAction.reason}`
        : `Variação associada a ação administrativa ${explicitPriceAction.action}.`,
    }
  }

  if (adminActions.length > 0 && news.length > 0) {
    return {
      causeType: 'ADMIN_ACTION',
      causeLabel: 'Ação administrativa com notícia no período',
      confidence: 'media',
      explanation: `Houve ${adminActions.length} ação administrativa e ${news.length} notícia vinculada na janela da mudança. Atribuição principal: intervenção operacional registrada pelo admin.`,
    }
  }

  const directionalNews = news.find((item) => sentimentMatchesDirection(item.sentiment, direction))
  if (directionalNews) {
    return {
      causeType: 'NEWS',
      causeLabel: 'Notícia vinculada',
      confidence: 'media',
      explanation: `A mudança coincide com a notícia "${directionalNews.title}", com sentimento ${directionalNews.sentiment} e impacto ${directionalNews.impact}.`,
    }
  }

  if (news.length > 0) {
    return {
      causeType: 'NEWS',
      causeLabel: 'Notícia vinculada, direção divergente',
      confidence: 'baixa',
      explanation: 'Existe notícia vinculada no período, mas o sentimento registrado não explica diretamente a direção da variação.',
    }
  }

  if (adminActions.length > 0) {
    return {
      causeType: 'ADMIN_ACTION',
      causeLabel: 'Ação administrativa',
      confidence: 'media',
      explanation: `A mudança ocorreu próxima de ${adminActions.length} ação administrativa, sem preço anterior/novo registrado para confirmar ajuste direto.`,
    }
  }

  if (source !== 'REAL') {
    return {
      causeType: 'SIMULATED_ENGINE',
      causeLabel: 'Motor de preço',
      confidence: 'media',
      explanation: context
        ? `O candle foi gerado pela fonte ${source}. ${buildMarketFlowExplanation(direction, context)} Parâmetros efetivos: cluster ${context.motor?.cluster ?? 'indefinido'}, sigma ${context.motor?.sigma ?? 'n/d'}, theta ${context.motor?.theta ?? 'n/d'}, OFI rho ${context.motor?.ofiRho ?? 'n/d'} e velocity cap ${context.motor?.velocityCapPct ?? 'n/d'}% por tick.`
        : `O candle foi gerado pela fonte ${source}; sem notícia ou ação administrativa vinculada, a variação parece vir do motor de precificação.`,
    }
  }

  if (volumeDelta > 0) {
    const hasOrderFlow = !!context?.orderFlow.orderCount
    return {
      causeType: 'MARKET_FLOW',
      causeLabel: hasOrderFlow ? 'Fluxo de negociação auditado' : 'Volume agregado sem ordem auditável',
      confidence: hasOrderFlow ? 'media' : 'baixa',
      explanation: context
        ? buildMarketFlowExplanation(direction, context)
        : `Não há notícia ou intervenção administrativa na janela. O volume aumentou em ${volumeDelta.toLocaleString('pt-BR')} unidades, sugerindo pressão de compra/venda dos usuários.`,
    }
  }

  return {
    causeType: 'UNEXPLAINED',
    causeLabel: 'Sem causa registrada',
    confidence: 'baixa',
    explanation: context
      ? `O preço variou de ${money(context.previousPrice)} para ${money(context.newPrice)} (${signedPct(context.percentageChange)}), mas não foram encontrados notícia, ação administrativa, ordens preenchidas ou aumento de volume suficientes na janela. A mudança deve ser tratada como não explicada pelos dados auditáveis disponíveis.`
      : 'Não foram encontrados notícia, ação administrativa ou aumento de volume suficientes para explicar a mudança com os dados disponíveis.',
  }
}

export function buildDiagnosticNotes(params: {
  movementPct: number
  volumeDelta: number
  source: string
  news: NewsEvidence[]
  adminActions: AdminActionEvidence[]
  confidence: Confidence
  causeType: CauseType
  orderFlow?: OrderFlowEvidence
}): string[] {
  const notes: string[] = []
  const absPct = Math.abs(params.movementPct)

  notes.push(`Magnitude ${magnitudeFromPct(params.movementPct)}: ${round2(absPct)}% entre os dois pontos de preço.`)

  if (params.news.length > 0) {
    notes.push(`${params.news.length} notícia(s) encontrada(s) na janela de correlação.`)
  } else {
    notes.push('Nenhuma notícia vinculada ao ativo foi encontrada na janela de correlação.')
  }

  if (params.adminActions.length > 0) {
    notes.push(`${params.adminActions.length} ação(ões) administrativa(s) próxima(s) ao movimento.`)
  }

  if (params.volumeDelta > 0) {
    notes.push(`Volume incremental de ${params.volumeDelta.toLocaleString('pt-BR')} unidades no período.`)
  }

  if (params.orderFlow) {
    notes.push(`Fluxo de ordens: ${orderFlowSummary(params.orderFlow)}.`)
  }

  if (params.source !== 'REAL') {
    notes.push(`Fonte do candle: ${params.source}. A leitura pode refletir simulação do motor.`)
  }

  if (params.confidence === 'baixa' || params.causeType === 'UNEXPLAINED') {
    notes.push('Atribuição causal fraca: faltam evidências diretas suficientes para afirmar o motivo.')
  }

  return notes
}

export function causePriority(cause: CauseType): number {
  return {
    ADMIN_ACTION: 5,
    NEWS: 4,
    MARKET_FLOW: 3,
    SIMULATED_ENGINE: 2,
    UNEXPLAINED: 1,
  }[cause]
}
