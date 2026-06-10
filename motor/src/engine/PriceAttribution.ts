import type {
  ActiveNewsImpact,
  AdminPriceAdjustment,
  AnyPriceAttribution,
  AttributionParseResult,
  CausalEvent,
  LayerContribution,
  LayerResult,
  OrderFlowSnapshot,
  PriceAttribution,
  PriceAttributionV2,
  QualityFlag,
  SessionType,
  TickInputSnapshot,
} from '../types/motor.types'

type BuildPriceAttributionParams = {
  previousPrice: number
  enginePrice: number
  finalPrice: number
  agentImpact: number
  syntheticVolume: number
  pendingBuyVolume: number
  pendingSellVolume: number
  sessionType: SessionType
  layerResults: LayerResult[]
  generatedAt: Date
  tickId?: string
  tickStartedAt?: Date
  tickEndedAt?: Date
  tickCount?: number
  inputSnapshot?: TickInputSnapshot
  orderFlowSnapshot?: OrderFlowSnapshot
  activeNewsImpacts?: ActiveNewsImpact[]
  adminAdjustments?: AdminPriceAdjustment[]
  qualityFlags?: QualityFlag[]
}

const EPSILON = 0.00000001
const MAX_PAYLOAD_BYTES = 64 * 1024
const MAX_CAUSAL_EVENTS = 20
const MAX_ORDER_IDS = 10

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
const PII_KEY_PATTERN = /(email|nome|name|saldo|balance|ip|session|payload|user|cpf|phone|telefone)/i

// Manter em sincronia EXATA com ENGINE_LAYER_LABELS no Next
// (footstock-next/src/lib/admin/value-analysis.ts): a UI deduplica a linha
// "Causa primária" comparando os dois wordings; drift gera frase duplicada.
const LAYER_CAUSES: Record<string, string> = {
  L9_DailyVolTarget: 'controle de volatilidade diária',
  L1_OrnsteinUhlenbeck: 'oscilação natural do mercado simulado',
  L2_FundamentalAnchor: 'reversão ao valor justo',
  L3_GARCHLite: 'volatilidade condicional do mercado',
  L4_OrderFlowImbalance: 'pressão acumulada do livro de ordens',
  L5_KyleLambda: 'impacto de liquidez das ordens',
  L6_SupplyScaling: 'escassez de float e liquidez',
  L7_PressureQueue: 'absorção de notícia',
  L7_5_Nudge: 'destravamento de baixa atividade',
  L8_VelocityCap: 'limite de velocidade do motor',
  L9_5_ApproachBrake: 'freio de aproximação do circuit breaker',
  L10_Correlation: 'correlação com outros clubes do mercado',
  L10_CircuitBreaker: 'circuit breaker',
  AgentOrchestrator: 'agentes simulados de mercado',
  AdminAdjustment: 'ajuste administrativo de preço',
}

const CONTROL_LAYERS = new Set([
  'L8_VelocityCap',
  'L9_DailyVolTarget',
  'L9_5_ApproachBrake',
  'L10_CircuitBreaker',
])

function round(value: number, decimals = 8): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function direction(delta: number): LayerContribution['direction'] {
  if (delta > EPSILON) return 'up'
  if (delta < -EPSILON) return 'down'
  return 'neutral'
}

function formatMoney(value: number): string {
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatSignedMoney(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatMoney(value)}`
}

function formatSignedPct(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`
}

function layerCause(layer: string): string {
  return LAYER_CAUSES[layer] ?? layer
}

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.slice(0, maxLength)
}

function sanitizeMetadata(value: unknown): Record<string, string | number | boolean> | undefined {
  if (!isRecord(value)) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (PII_KEY_PATTERN.test(key)) continue
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = round(raw, 8)
    else if (typeof raw === 'boolean') out[key] = raw
    else if (typeof raw === 'string') {
      if (PII_KEY_PATTERN.test(raw)) continue
      out[key] = raw.slice(0, 120)
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
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

function buildContribution(layer: string, deltaPrice: number, totalAbsDelta: number, metadata?: Record<string, number | string | boolean>): LayerContribution {
  return {
    layer,
    deltaPrice: round(deltaPrice),
    contributionPct: totalAbsDelta > EPSILON ? round((Math.abs(deltaPrice) / totalAbsDelta) * 100, 4) : 0,
    direction: direction(deltaPrice),
    metadata: sanitizeMetadata(metadata),
  }
}

export function buildPriceAttribution(params: BuildPriceAttributionParams): PriceAttribution {
  const adminAdjustments = params.adminAdjustments ?? []
  const adminDelta = adminAdjustments.reduce((sum, adj) => sum + (adj.newPrice - adj.previousPrice), 0)
  // previousPrice e o preco PRE-ajuste admin; o salto admin tem contribuicao
  // propria (AdminAdjustment) e NAO pode inflar engineDelta, senao os campos
  // derivados atribuiriam o ajuste manual as camadas do motor.
  const engineDelta = params.enginePrice - params.previousPrice - adminDelta
  const agentDelta = params.finalPrice - params.enginePrice
  const rawContributions = params.layerResults
    .filter((result) => Math.abs(result.deltaPrice) > EPSILON || CONTROL_LAYERS.has(result.layer))
    .map((result) => ({
      layer: result.layer,
      deltaPrice: result.deltaPrice,
      metadata: result.metadata,
    }))

  if (Math.abs(agentDelta) > EPSILON || params.syntheticVolume > 0 || Math.abs(params.agentImpact) > EPSILON) {
    rawContributions.push({
      layer: 'AgentOrchestrator',
      deltaPrice: agentDelta,
      metadata: {
        impactPct: params.agentImpact * 100,
        syntheticVolume: params.syntheticVolume,
      },
    })
  }

  if (adminAdjustments.length > 0) {
    rawContributions.push({
      layer: 'AdminAdjustment',
      deltaPrice: adminDelta,
      metadata: {
        adjustmentCount: adminAdjustments.length,
        ...(adminAdjustments[0]?.reason ? { reason: adminAdjustments[0].reason.slice(0, 160) } : {}),
        occurredAt: adminAdjustments[0]?.occurredAt ?? params.generatedAt.toISOString(),
        targetPrice: adminAdjustments[adminAdjustments.length - 1]?.newPrice ?? params.finalPrice,
      },
    })
  }

  const totalAbsDelta = rawContributions.reduce((sum, item) => sum + Math.abs(item.deltaPrice), 0)
  const layerContributions = rawContributions
    .map((item) => buildContribution(item.layer, item.deltaPrice, totalAbsDelta, item.metadata))
    .sort((a, b) => Math.abs(b.deltaPrice) - Math.abs(a.deltaPrice))

  const primaryContribution = layerContributions.find((item) => Math.abs(item.deltaPrice) > EPSILON) ?? null
  const orderImbalance = params.pendingBuyVolume - params.pendingSellVolume
  const primaryCause = primaryContribution ? layerCause(primaryContribution.layer) : 'sem alteração material de preço'
  const totalChangePct = params.previousPrice > 0
    ? ((params.finalPrice - params.previousPrice) / params.previousPrice) * 100
    : 0
  const runnerUp = layerContributions
    .filter((item) => item.layer !== primaryContribution?.layer && Math.abs(item.deltaPrice) > EPSILON)
    .slice(0, 2)
    .map((item) => `${layerCause(item.layer)} (${formatSignedMoney(item.deltaPrice)})`)

  const orderContext = params.pendingBuyVolume !== 0 || params.pendingSellVolume !== 0
    ? ` Pressão do book no tick: ${params.pendingBuyVolume.toLocaleString('pt-BR')} compra(s), ${params.pendingSellVolume.toLocaleString('pt-BR')} venda(s), saldo ${orderImbalance.toLocaleString('pt-BR')}.`
    : ' Sem pressão pendente de book no tick.'

  const agentContext = params.syntheticVolume > 0 || Math.abs(params.agentImpact) > EPSILON
    ? ` Agentes sintéticos adicionaram ${params.syntheticVolume.toLocaleString('pt-BR')} unidade(s) e impacto de ${formatSignedPct(params.agentImpact * 100)}.`
    : ' Agentes sintéticos não alteraram materialmente o preço neste tick.'

  const secondaryContext = runnerUp.length > 0
    ? ` Contribuições secundárias: ${runnerUp.join('; ')}.`
    : ''

  const explanation = primaryContribution
    ? `O preço mudou de ${formatMoney(params.previousPrice)} para ${formatMoney(params.finalPrice)} (${formatSignedPct(totalChangePct)}) porque a maior contribuição registrada no motor foi ${primaryCause}: camada ${primaryContribution.layer} aplicou ${formatSignedMoney(primaryContribution.deltaPrice)} (${primaryContribution.contributionPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% do deslocamento absoluto medido).${secondaryContext}${orderContext}${agentContext}`
    : `O motor registrou candle sem deslocamento material entre ${formatMoney(params.previousPrice)} e ${formatMoney(params.finalPrice)}.${orderContext}${agentContext}`

  return {
    version: 1,
    primaryCause,
    primaryLayer: primaryContribution?.layer ?? null,
    confidence: 'alta',
    explanation,
    previousPrice: round(params.previousPrice),
    enginePrice: round(params.enginePrice),
    finalPrice: round(params.finalPrice),
    engineDelta: round(engineDelta),
    agentImpactPct: round(params.agentImpact * 100, 6),
    agentDelta: round(agentDelta),
    syntheticVolume: params.syntheticVolume,
    pendingBuyVolume: params.pendingBuyVolume,
    pendingSellVolume: params.pendingSellVolume,
    orderImbalance,
    sessionType: params.sessionType,
    layerContributions,
    appliedControls: layerContributions
      .filter((item) => CONTROL_LAYERS.has(item.layer))
      .map((item) => item.layer),
    generatedAt: params.generatedAt.toISOString(),
  }
}

function eventTypeForLayer(layer: string): CausalEvent['type'] {
  if (layer === 'L7_PressureQueue') return 'NEWS'
  if (layer === 'L4_OrderFlowImbalance' || layer === 'L5_KyleLambda') return 'ORDER_FLOW'
  if (layer === 'AgentOrchestrator') return 'SYNTHETIC_AGENT'
  if (layer === 'L10_Correlation') return 'CORRELATION'
  if (layer === 'L7_5_Nudge') return 'NUDGE'
  if (layer === 'AdminAdjustment') return 'ADMIN_ACTION'
  if (CONTROL_LAYERS.has(layer)) return 'CONTROL'
  return 'LAYER'
}

function layerEvidenceSentence(contribution: LayerContribution | null, snapshot?: OrderFlowSnapshot): string {
  if (!contribution) return 'O motor nao registrou deslocamento material no tick.'
  if (contribution.layer === 'L2_FundamentalAnchor') {
    const fairValue = contribution.metadata?.fairValue
    return fairValue === undefined
      ? 'A evidencia direta e a contribuicao da camada L2 gravada antes da persistencia.'
      : `A evidencia direta e a camada L2, com fair value ${fairValue}.`
  }
  if (contribution.layer === 'L3_GARCHLite') {
    const variance = contribution.metadata?.variance
    return variance === undefined
      ? 'A evidencia direta e a volatilidade condicional calculada pela camada L3.'
      : `A evidencia direta e a variancia condicional ${variance} registrada pela L3.`
  }
  if (contribution.layer === 'L7_PressureQueue') {
    const newsId = contribution.metadata?.newsId
    const phase = contribution.metadata?.phaseLabel ?? contribution.metadata?.phase
    return `A evidencia direta e a noticia aplicada pela L7${newsId ? ` (${newsId})` : ''}${phase ? ` na fase ${phase}` : ''}.`
  }
  if (contribution.layer === 'L4_OrderFlowImbalance' || contribution.layer === 'L5_KyleLambda') {
    return snapshot
      ? `A evidencia direta e o snapshot pre-preco: saldo comprador ${snapshot.openBuyQty + snapshot.marketBuyQty} contra vendedor ${snapshot.openSellQty + snapshot.marketSellQty}.`
      : 'A evidencia direta e a camada de fluxo de ordens gravada antes da persistencia.'
  }
  if (contribution.layer === 'AgentOrchestrator') {
    const reasonCode = contribution.metadata?.reasonCode
    return reasonCode
      ? `A evidencia direta e o AgentOrchestrator com reasonCode ${reasonCode}.`
      : 'hipotese: AgentOrchestrator foi dominante, mas nao forneceu submotivo operacional.'
  }
  if (contribution.layer === 'AdminAdjustment') {
    const targetPrice = contribution.metadata?.targetPrice
    return targetPrice === undefined
      ? 'A evidencia direta e o ajuste manual de preco registrado pelo admin neste intervalo.'
      : `A evidencia direta e o ajuste manual de preco registrado pelo admin neste intervalo (preco alvo ${formatMoney(Number(targetPrice))}).`
  }
  return `A evidencia direta e a contribuicao ${contribution.layer} gravada pelo motor.`
}

function buildCausalEvents(params: BuildPriceAttributionParams, base: PriceAttribution): CausalEvent[] {
  const events: CausalEvent[] = []
  const now = params.generatedAt.toISOString()
  const activeNews = params.activeNewsImpacts ?? params.inputSnapshot?.activeNewsImpacts ?? []
  const snapshot = params.orderFlowSnapshot ?? params.inputSnapshot?.orderFlowSnapshot
  const adminAdjustments = params.adminAdjustments ?? []

  for (const contribution of base.layerContributions) {
    if (events.length >= MAX_CAUSAL_EVENTS) break
    if (Math.abs(contribution.deltaPrice) <= EPSILON && !CONTROL_LAYERS.has(contribution.layer)) continue
    const type = eventTypeForLayer(contribution.layer)
    // Para o evento NEWS da L7, a fonte da verdade e o metadata da contribuicao,
    // capturado DENTRO do applyLayer (antes da expiracao/handoff da fila).
    // activeNews[0] e snapshot POS-calculo: no ultimo tick de vida da noticia
    // ja aponta para a proxima da fila (noticia errada) ou esta vazio.
    const metaNewsId = typeof contribution.metadata?.newsId === 'string' && contribution.metadata.newsId !== ''
      ? contribution.metadata.newsId
      : undefined
    const news = type === 'NEWS'
      ? (metaNewsId
          ? activeNews.find((item) => item.newsId === metaNewsId) ?? {
              newsId: metaNewsId,
              title: typeof contribution.metadata?.title === 'string' && contribution.metadata.title !== ''
                ? contribution.metadata.title
                : undefined,
              impactCategory: typeof contribution.metadata?.impactCategory === 'string' && contribution.metadata.impactCategory !== ''
                ? contribution.metadata.impactCategory
                : undefined,
              sentiment: typeof contribution.metadata?.sentiment === 'number' ? contribution.metadata.sentiment : undefined,
            }
          : activeNews[0])
      : undefined
    const adminAdjustment = type === 'ADMIN_ACTION' ? adminAdjustments[0] : undefined
    const orderIds = type === 'ORDER_FLOW' ? (snapshot?.topOrderIds ?? []).slice(0, MAX_ORDER_IDS) : undefined
    events.push({
      id: `${params.tickId ?? 'tick'}:${contribution.layer}:${events.length}`,
      type,
      source: contribution.layer,
      occurredAt: adminAdjustment?.occurredAt ?? now,
      direction: contribution.direction,
      magnitude: Math.abs(contribution.deltaPrice),
      layer: contribution.layer,
      newsId: news?.newsId,
      title: type === 'NEWS'
        ? sanitizeText(news?.title, 160)
        : type === 'ADMIN_ACTION'
          ? sanitizeText(adminAdjustment?.reason, 160)
          : undefined,
      impactCategory: news?.impactCategory,
      sentiment: news?.sentiment,
      orderIds,
      orderIdsTruncated: type === 'ORDER_FLOW' ? !!snapshot?.orderIdsTruncated : undefined,
      reasonCode: typeof contribution.metadata?.reasonCode === 'string' ? contribution.metadata.reasonCode : undefined,
      metadata: sanitizeMetadata(contribution.metadata),
    })
  }

  if (activeNews.length > 0 && !events.some((event) => event.type === 'NEWS')) {
    for (const news of activeNews.slice(0, MAX_CAUSAL_EVENTS - events.length)) {
      events.push({
        id: `${params.tickId ?? 'tick'}:news:${news.newsId ?? news.correlationId ?? events.length}`,
        type: 'NEWS',
        source: 'activeNewsImpacts',
        occurredAt: news.publishedAt ?? now,
        direction: news.magnitude > EPSILON ? 'up' : news.magnitude < -EPSILON ? 'down' : 'neutral',
        magnitude: Math.abs(news.magnitude),
        newsId: news.newsId,
        title: sanitizeText(news.title, 160),
        impactCategory: news.impactCategory,
        sentiment: news.sentiment,
      })
    }
  }

  return events.slice(0, MAX_CAUSAL_EVENTS)
}

type PrimaryExplanationOpts = {
  previousPrice: number
  finalPrice: number
  primaryContribution: LayerContribution | null
  tickCount: number
  newsTitle?: string
  adminReason?: string
  pendingBuyVolume?: number
  pendingSellVolume?: number
}

// Frase principal voltada ao usuario final da aba de analise: descreve o
// movimento real (precos e %) e a causa dominante em linguagem humana.
// Codigos de camada (L1..L10) NUNCA aparecem aqui — apenas em explanation
// (rastro tecnico) e layerContributions.
function humanPrimaryExplanation(opts: PrimaryExplanationOpts): string {
  if (!opts.primaryContribution) {
    return `O motor não registrou alteração material de preço neste candle (${formatMoney(opts.previousPrice)} para ${formatMoney(opts.finalPrice)}).`
  }
  const changePct = opts.previousPrice > 0
    ? ((opts.finalPrice - opts.previousPrice) / opts.previousPrice) * 100
    : 0
  const movimento = changePct > EPSILON
    ? `O preço subiu de ${formatMoney(opts.previousPrice)} para ${formatMoney(opts.finalPrice)} (${formatSignedPct(changePct)})`
    : changePct < -EPSILON
      ? `O preço caiu de ${formatMoney(opts.previousPrice)} para ${formatMoney(opts.finalPrice)} (${formatSignedPct(changePct)})`
      : `O preço terminou praticamente estável em ${formatMoney(opts.finalPrice)}`
  const layer = opts.primaryContribution.layer
  const delta = formatSignedMoney(opts.primaryContribution.deltaPrice)
  const consolidacao = opts.tickCount > 1
    ? ` O candle consolida ${opts.tickCount} ticks do motor.`
    : ''

  // A camada primaria (maior |delta| liquido) pode ter empurrado CONTRA o
  // movimento final do candle (cabo-de-guerra entre camadas). Afirmar que ela
  // "impulsionou" a variacao seria mentir sobre a direcao da forca.
  const opposes =
    (changePct > EPSILON && opts.primaryContribution.deltaPrice < -EPSILON) ||
    (changePct < -EPSILON && opts.primaryContribution.deltaPrice > EPSILON)
  if (opposes) {
    const forca = layer === 'L7_PressureQueue' && opts.newsTitle
      ? `a notícia "${opts.newsTitle}"`
      : layer === 'AdminAdjustment'
        ? 'o ajuste administrativo de preço'
        : layer === 'L4_OrderFlowImbalance' || layer === 'L5_KyleLambda'
          ? 'a pressão do livro de ordens'
          : layerCause(layer)
    return `${movimento}, mesmo com ${forca} (${delta}) pressionando na direção contrária; o movimento veio do saldo das demais influências do período.${consolidacao}`
  }

  let causa: string
  if (layer === 'L7_PressureQueue' && opts.newsTitle) {
    causa = `pela notícia "${opts.newsTitle}" sendo absorvida pelo mercado (${delta})`
  } else if (layer === 'AdminAdjustment') {
    causa = opts.adminReason
      ? `por ajuste administrativo de preço (motivo registrado: ${opts.adminReason}; ${delta})`
      : `por ajuste administrativo de preço (${delta})`
  } else if (layer === 'L4_OrderFlowImbalance' || layer === 'L5_KyleLambda') {
    const buy = opts.pendingBuyVolume ?? 0
    const sell = opts.pendingSellVolume ?? 0
    const lado = buy > sell ? 'compradora' : sell > buy ? 'vendedora' : 'equilibrada'
    const escala = opts.tickCount > 1 ? ' em média por tick' : ''
    causa = `pela pressão ${lado} do livro de ordens registrada antes do cálculo do preço (${buy.toLocaleString('pt-BR')} compra(s) contra ${sell.toLocaleString('pt-BR')} venda(s)${escala}; ${delta})`
  } else {
    causa = `por ${layerCause(layer)} (${delta})`
  }
  return `${movimento}, principalmente ${causa}.${consolidacao}`
}

export function buildPriceAttributionV2(params: BuildPriceAttributionParams): PriceAttributionV2 {
  const base = buildPriceAttribution(params)
  const causalEvents = buildCausalEvents(params, base)
  const primaryEvent =
    causalEvents.find((event) => event.layer === base.primaryLayer && event.magnitude > EPSILON) ??
    causalEvents.find((event) => event.magnitude > EPSILON) ??
    null
  const parsedParamFlags = validQualityFlags(params.qualityFlags ?? []) ?? []
  const qualityFlags: QualityFlag[] = [
    ...parsedParamFlags,
    ...(params.inputSnapshot?.activeNewsImpacts ?? [])
      .flatMap((news) => news.qualityFlags)
      .filter((flag) => QUALITY_FLAG_SET.has(flag)),
    ...(params.orderFlowSnapshot?.qualityFlags ?? []),
  ]
  const uniqueFlags = [...new Set<QualityFlag>(qualityFlags)]
  const primaryContribution = base.layerContributions.find((item) => item.layer === base.primaryLayer) ?? null
  const attribution: PriceAttributionV2 = {
    version: 2,
    tickId: params.tickId ?? `tick-${params.generatedAt.getTime()}`,
    tickCount: params.tickCount ?? 1,
    tickStartedAt: (params.tickStartedAt ?? params.generatedAt).toISOString(),
    tickEndedAt: (params.tickEndedAt ?? params.generatedAt).toISOString(),
    primaryEventId: primaryEvent?.id ?? null,
    primaryCause: base.primaryCause,
    primaryLayer: base.primaryLayer,
    confidence: base.confidence,
    explanation: base.explanation,
    primaryExplanation: humanPrimaryExplanation({
      previousPrice: base.previousPrice,
      finalPrice: base.finalPrice,
      primaryContribution,
      tickCount: params.tickCount ?? 1,
      // O titulo vem do evento causal NEWS (que ja prefere o metadata da L7,
      // imune ao handoff de fila pos-calculo), nao do snapshot activeNews[0].
      newsTitle: causalEvents.find((event) => event.type === 'NEWS' && event.title)?.title,
      adminReason: params.adminAdjustments?.[0]?.reason,
      pendingBuyVolume: base.pendingBuyVolume,
      pendingSellVolume: base.pendingSellVolume,
    }),
    evidenceSentence: layerEvidenceSentence(primaryContribution, params.orderFlowSnapshot ?? params.inputSnapshot?.orderFlowSnapshot),
    caveatSentence: 'Esta e causalidade operacional do motor, nao prova econometrica externa de mercado.',
    previousPrice: base.previousPrice,
    enginePrice: base.enginePrice,
    finalPrice: base.finalPrice,
    engineDelta: base.engineDelta,
    agentImpactPct: base.agentImpactPct,
    agentDelta: base.agentDelta,
    syntheticVolume: base.syntheticVolume,
    pendingBuyVolume: base.pendingBuyVolume,
    pendingSellVolume: base.pendingSellVolume,
    orderImbalance: base.orderImbalance,
    sessionType: base.sessionType,
    layerContributions: base.layerContributions,
    causalEvents,
    inputSnapshot: params.inputSnapshot,
    executedOrderSummary: {
      orderCount: 0,
      buyQuantity: 0,
      sellQuantity: 0,
      note: 'Ordens executadas apos o calculo do preco nao entram em causalEvents.ORDER_FLOW; apenas snapshot pre-preco e elegivel como causa direta.',
    },
    appliedControls: base.appliedControls,
    qualityFlags: uniqueFlags,
    payloadBytes: 0,
    generatedAt: base.generatedAt,
  }

  attribution.payloadBytes = byteSize(attribution)
  if (attribution.payloadBytes <= MAX_PAYLOAD_BYTES) return attribution

  attribution.qualityFlags = [...new Set<QualityFlag>([...attribution.qualityFlags, 'ATTRIBUTION_TRUNCATED'])]
  attribution.causalEvents = attribution.causalEvents.slice(0, Math.max(1, Math.floor(MAX_CAUSAL_EVENTS / 2)))
  attribution.layerContributions = attribution.layerContributions.slice(0, 8)
  attribution.inputSnapshot = attribution.inputSnapshot
    ? {
        ...attribution.inputSnapshot,
        activeNewsImpacts: attribution.inputSnapshot.activeNewsImpacts.slice(0, 2),
        orderFlowSnapshot: attribution.inputSnapshot.orderFlowSnapshot
          ? {
              ...attribution.inputSnapshot.orderFlowSnapshot,
              topOrderIds: attribution.inputSnapshot.orderFlowSnapshot.topOrderIds.slice(0, MAX_ORDER_IDS),
              orderIdsTruncated: attribution.inputSnapshot.orderFlowSnapshot.orderIdsTruncated || attribution.inputSnapshot.orderFlowSnapshot.topOrderIds.length > MAX_ORDER_IDS,
            }
          : undefined,
      }
    : undefined
  attribution.payloadBytes = byteSize(attribution)
  return attribution
}

function isPriceAttributionV1(value: unknown): value is PriceAttribution {
  if (!isRecord(value)) return false
  return (
    value.version === 1 &&
    typeof value.primaryCause === 'string' &&
    typeof value.explanation === 'string' &&
    Array.isArray(value.layerContributions)
  )
}

function isPriceAttributionV2(value: unknown): value is PriceAttributionV2 {
  if (!isRecord(value)) return false
  const flags = validQualityFlags(value.qualityFlags)
  return (
    value.version === 2 &&
    typeof value.tickId === 'string' &&
    typeof value.tickCount === 'number' &&
    typeof value.tickStartedAt === 'string' &&
    typeof value.tickEndedAt === 'string' &&
    Array.isArray(value.causalEvents) &&
    typeof value.primaryCause === 'string' &&
    (typeof value.primaryEventId === 'string' || value.primaryEventId === null) &&
    flags !== null
  )
}

export function parsePriceAttribution(value: unknown): AttributionParseResult {
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

  if (isPriceAttributionV2(candidate)) {
    return {
      ok: true,
      value: candidate,
      evidenceGrade: 'DIRECT',
      qualityFlags: candidate.qualityFlags,
    }
  }
  if (isPriceAttributionV1(candidate)) {
    return {
      ok: true,
      value: candidate,
      evidenceGrade: 'DIRECT',
      qualityFlags: [],
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

export function mergePriceAttributions(attributions: AnyPriceAttribution[], generatedAt: Date): AnyPriceAttribution | null {
  if (attributions.length === 0) return null
  if (attributions.length === 1) return attributions[0]

  const first = attributions[0]
  const last = attributions[attributions.length - 1]
  const layerTotals = new Map<string, { deltaPrice: number; grossAbsDelta: number; metadata?: Record<string, number | string | boolean> }>()

  for (const attribution of attributions) {
    for (const contribution of attribution.layerContributions) {
      const current = layerTotals.get(contribution.layer) ?? { deltaPrice: 0, grossAbsDelta: 0, metadata: contribution.metadata }
      current.deltaPrice += contribution.deltaPrice
      current.grossAbsDelta += Math.abs(contribution.deltaPrice)
      current.metadata = contribution.metadata ?? current.metadata
      layerTotals.set(contribution.layer, current)
    }
  }

  const totalAbsDelta = [...layerTotals.values()].reduce((sum, item) => sum + Math.abs(item.deltaPrice), 0)
  // grossAbsDelta preserva o caminho percorrido pela camada dentro do candle:
  // ticks que oscilaram em direcoes opostas somam gross alto com net baixo, e a
  // API usa essa razao para nao apresentar o saldo liquido como historia completa.
  const layerContributions = [...layerTotals.entries()]
    .map(([layer, item]) => buildContribution(layer, item.deltaPrice, totalAbsDelta, {
      ...(item.metadata ?? {}),
      grossAbsDelta: round(item.grossAbsDelta),
    }))
    .filter((item) => Math.abs(item.deltaPrice) > EPSILON || CONTROL_LAYERS.has(item.layer))
    .sort((a, b) => Math.abs(b.deltaPrice) - Math.abs(a.deltaPrice))

  const primaryContribution = layerContributions.find((item) => Math.abs(item.deltaPrice) > EPSILON) ?? null
  const primaryCause = primaryContribution ? layerCause(primaryContribution.layer) : 'sem alteração material de preço'
  const previousPrice = first.previousPrice
  const finalPrice = last.finalPrice
  const totalChangePct = previousPrice > 0 ? ((finalPrice - previousPrice) / previousPrice) * 100 : 0
  const engineDelta = attributions.reduce((sum, item) => sum + item.engineDelta, 0)
  const agentDelta = attributions.reduce((sum, item) => sum + item.agentDelta, 0)
  const syntheticVolume = attributions.reduce((sum, item) => sum + item.syntheticVolume, 0)
  // Media por tick, nao soma: pendingBuy/Sell sao snapshots point-in-time do
  // book; somar contaria a mesma ordem aberta N vezes ao longo do candle.
  const pendingBuyVolume = Math.round(attributions.reduce((sum, item) => sum + item.pendingBuyVolume, 0) / attributions.length)
  const pendingSellVolume = Math.round(attributions.reduce((sum, item) => sum + item.pendingSellVolume, 0) / attributions.length)
  const orderImbalance = pendingBuyVolume - pendingSellVolume
  const runnerUp = layerContributions
    .filter((item) => item.layer !== primaryContribution?.layer && Math.abs(item.deltaPrice) > EPSILON)
    .slice(0, 3)
    .map((item) => `${layerCause(item.layer)} (${formatSignedMoney(item.deltaPrice)})`)

  const secondaryContext = runnerUp.length > 0
    ? ` Contribuições secundárias acumuladas: ${runnerUp.join('; ')}.`
    : ''

  const explanation = primaryContribution
    ? `O candle agregado consolidou ${attributions.length} ticks do motor. O preço mudou de ${formatMoney(previousPrice)} para ${formatMoney(finalPrice)} (${formatSignedPct(totalChangePct)}) porque a maior contribuição acumulada foi ${primaryCause}: camada ${primaryContribution.layer} somou ${formatSignedMoney(primaryContribution.deltaPrice)} (${primaryContribution.contributionPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% do deslocamento absoluto medido).${secondaryContext} Pressão média do book por tick: ${pendingBuyVolume.toLocaleString('pt-BR')} compra(s), ${pendingSellVolume.toLocaleString('pt-BR')} venda(s), saldo ${orderImbalance.toLocaleString('pt-BR')}. Agentes sintéticos adicionaram ${syntheticVolume.toLocaleString('pt-BR')} unidade(s) e deslocamento acumulado de ${formatSignedMoney(agentDelta)}.`
    : `O candle agregado consolidou ${attributions.length} ticks sem deslocamento material entre ${formatMoney(previousPrice)} e ${formatMoney(finalPrice)}.`

  const mergedV1: PriceAttribution = {
    version: 1,
    primaryCause,
    primaryLayer: primaryContribution?.layer ?? null,
    confidence: 'alta',
    explanation,
    previousPrice: round(previousPrice),
    enginePrice: round(last.enginePrice),
    finalPrice: round(finalPrice),
    engineDelta: round(engineDelta),
    agentImpactPct: previousPrice > 0 ? round((agentDelta / previousPrice) * 100, 6) : 0,
    agentDelta: round(agentDelta),
    syntheticVolume,
    pendingBuyVolume,
    pendingSellVolume,
    orderImbalance,
    sessionType: last.sessionType,
    layerContributions,
    appliedControls: [...new Set(attributions.flatMap((item) => item.appliedControls))],
    generatedAt: generatedAt.toISOString(),
  }

  if (attributions.every((item): item is PriceAttributionV2 => item.version === 2)) {
    const firstV2 = attributions[0]
    const lastV2 = attributions[attributions.length - 1]
    // Prioridade no cap de 20 eventos: ADMIN_ACTION e NEWS primeiro (sort
    // estavel preserva ordem de tick dentro de cada grupo). Com ~7 eventos por
    // tick e 6 ticks por candle persistido, um slice cego em ordem de tick
    // derrubava o evento admin/noticia dos ticks finais e a explicacao perdia
    // o motivo real silenciosamente.
    const EVENT_PRIORITY: Record<string, number> = { ADMIN_ACTION: 0, NEWS: 1 }
    const causalEvents = attributions
      .flatMap((item) => item.causalEvents)
      .sort((a, b) => (EVENT_PRIORITY[a.type] ?? 2) - (EVENT_PRIORITY[b.type] ?? 2))
      .slice(0, MAX_CAUSAL_EVENTS)
    const qualityFlags = [...new Set<QualityFlag>(attributions.flatMap((item) => item.qualityFlags))]
    // Sem fallback para causalEvents[0]: apontar primaryEventId para um evento
    // de outra camada faria o Next derivar causa errada. null e honesto.
    const primaryEvent = causalEvents.find((event) => event.layer === mergedV1.primaryLayer) ?? null
    const mergedTickCount = attributions.reduce((sum, item) => sum + item.tickCount, 0)
    const newsEvents = causalEvents
      .filter((event) => event.type === 'NEWS' && event.title)
      .sort((a, b) => b.magnitude - a.magnitude)
    // Noticia dominante: a de maior magnitude aplicada pela L7, nao a primeira
    // do array (candle pode ter absorvido mais de uma noticia).
    const newsTitle = (newsEvents.find((event) => event.layer === mergedV1.primaryLayer) ?? newsEvents[0])?.title
    const adminReason = causalEvents.find((event) => event.type === 'ADMIN_ACTION' && event.title)?.title
    // Razao net/gross da camada primaria: < 0.3 indica que os ticks oscilaram
    // em direcoes opostas e o saldo liquido nao conta a historia completa.
    const primaryGross = primaryContribution ? (layerTotals.get(primaryContribution.layer)?.grossAbsDelta ?? 0) : 0
    const primaryIsChoppy = primaryContribution !== null && primaryGross > EPSILON &&
      Math.abs(primaryContribution.deltaPrice) / primaryGross < 0.3
    const mergedV2: PriceAttributionV2 = {
      ...mergedV1,
      version: 2,
      tickId: `${firstV2.tickId}..${lastV2.tickId}`,
      tickCount: mergedTickCount,
      tickStartedAt: firstV2.tickStartedAt,
      tickEndedAt: lastV2.tickEndedAt,
      primaryEventId: primaryEvent?.id ?? null,
      primaryExplanation: humanPrimaryExplanation({
        previousPrice: mergedV1.previousPrice,
        finalPrice: mergedV1.finalPrice,
        primaryContribution,
        tickCount: mergedTickCount,
        newsTitle,
        adminReason,
        pendingBuyVolume: mergedV1.pendingBuyVolume,
        pendingSellVolume: mergedV1.pendingSellVolume,
      }),
      evidenceSentence: primaryContribution
        ? `A evidencia direta e a agregacao de ${attributions.length} tick(s) do motor com ${layerCause(primaryContribution.layer)} como influencia dominante.`
        : 'O candle agregado nao teve influencia dominante material.',
      caveatSentence: primaryIsChoppy
        ? 'Os ticks deste candle oscilaram em direcoes opostas; a causa primaria reflete o saldo liquido do periodo, nao o caminho completo do preco.'
        : 'O candle agrega multiplos ticks; sinais opostos podem ter sido simplificados pela causa primaria.',
      causalEvents,
      appliedControls: mergedV1.appliedControls,
      qualityFlags,
      payloadBytes: 0,
      generatedAt: generatedAt.toISOString(),
    }
    mergedV2.payloadBytes = byteSize(mergedV2)
    return mergedV2.payloadBytes > MAX_PAYLOAD_BYTES
      ? { ...mergedV2, qualityFlags: [...new Set<QualityFlag>([...mergedV2.qualityFlags, 'ATTRIBUTION_TRUNCATED'])], causalEvents: mergedV2.causalEvents.slice(0, 10), payloadBytes: byteSize({ ...mergedV2, causalEvents: mergedV2.causalEvents.slice(0, 10) }) }
      : mergedV2
  }

  return mergedV1
}
