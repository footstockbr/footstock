// ============================================================================
// FootStock Motor — Tipos e Interfaces Centrais
// ============================================================================

// ─── Clusters ─────────────────────────────────────────────────────────────

export type AssetCluster = 'A_TOP' | 'A_MID' | 'A_SMALL' | 'B_LIQUID' | 'B_ILLIQ'

export interface ClusterParams {
  cluster: AssetCluster
  baseVolume: number          // Volume base para simulação
  drift: number               // Tendência diária (ex: -0.0002)
  theta: number               // OU: velocidade de reversão (ex: 0.12)
  sigma: number               // OU: volatilidade do processo estocástico
  garchAlpha: number          // Peso do choque recente (α)
  garchBeta: number           // Persistência da volatilidade (β)
  lambdaKyle: number          // Impacto de preço por unidade de volume (λ)
  spread: number              // Spread bid-ask base
  maxTickChange: number       // Variação máxima por tick (ex: 0.0035 = 0.35%)
  ofiDecay: number            // OFI: decay por cluster (ex: A_TOP=0.91, B_ILLIQ=0.97)
  alphaOfi: number            // OFI: fator de impacto no preço (delta_OFI = alphaOfi * OFI_t)
  fundamentalReversionRate?: number // Cap da L2 por tick (default 0.003)
  garchOmega?: number         // L3: termo omega do GARCH(1,1)
  garchVolCap?: number        // L3: multiplicador maximo da variancia base
  supplyAmpCap?: number       // L6: amplificador maximo total (default 2.0)
  pressureSpreadTicks?: number // L7: fase inicial da noticia
  pressureAbsorptionTicks?: number // L7: fase de absorcao da noticia
  pressureSpotCap?: number    // L7: cap instantaneo por noticia
  circuitBreakerThreshold?: number // L10: threshold de halt normal
}

// ─── Motor Tick ───────────────────────────────────────────────────────────

export interface MotorTick {
  assetId: string
  ticker: string
  price: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  change: number              // Variação absoluta em relação ao close anterior
  changePercent: number       // Variação percentual
  sessionType: SessionType
  timestamp: number           // Unix ms
  isHalted?: boolean          // Circuit breaker ativo
  haltReason?: string | null  // Motivo do halt (CIRCUIT_BREAKER ou reason admin)
  estimatedResume?: number | null  // Unix ms estimado para retomada
  attribution?: AnyPriceAttribution
}

// ─── Session ──────────────────────────────────────────────────────────────

export type SessionType = 'PRE_OPENING' | 'TRADING' | 'CLOSING_CALL' | 'AFTER_MARKET' | 'CLOSED'

export interface SessionWindow {
  type: SessionType
  startHour: number     // Hora de início (BRT, 0-23)
  startMinute: number
  endHour: number       // Hora de fim (BRT, 0-23)
  endMinute: number
  volatilityMultiplier: number  // Multiplicador de volatilidade durante a sessão
}

// ─── Asset State ─────────────────────────────────────────────────────────

export interface AssetState {
  id: string
  ticker: string
  cluster: AssetCluster
  state: string              // UF do clube — usado para correlação regional
  currentPrice: number
  openPrice: number
  highPrice: number
  lowPrice: number
  closePrice: number         // Close do dia anterior (âncora GARCH)
  fairValue: number          // Valor justo estático (float/totalShares) — âncora OU
  volume: number
  variance: number           // Variância GARCH atual (σ²)
  pendingBuyVolume: number   // OFI: volume comprador pendente
  pendingSellVolume: number  // OFI: volume vendedor pendente
  isPaused: boolean          // Circuit breaker ou ação admin
  haltReason: string | null  // Motivo do halt ('CIRCUIT_BREAKER', 'FORCE_CIRCUIT_BREAKER', etc.)
  haltResumeAt: number | null // Unix ms estimado para retomada automática
  newsImpact: number         // Magnitude de notícia ativa (0.0 a 1.0)
  newsImpactTicks: number    // Ticks restantes do efeito da notícia
  activeNewsImpacts?: ActiveNewsImpact[]
  // L4 — OFI: estado do decaimento exponencial (OFI_t = rho*OFI_{t-1} + (1-rho)*ofi_raw_t)
  ofiState: number
  // L9 — DailyVolTarget: acumulador de variação percentual do dia (0–1)
  dailyVolAccum: number
  // L9 — DailyVolTarget: multiplicador de sigma aplicado em L1/L3 (1.0 = normal, 0.0 = freeze)
  dailySigmaMultiplier: number
  // Multiplicador de volatilidade por sessão (SessionManager): CLOSED=0, PRE_OPENING=0.3, TRADING=1.0, etc.
  volatilityMultiplier: number
  // Nudge — ticks consecutivos sem variação de preço (reset a cada movimento real).
  // Quando atinge NUDGE_TICKS, dispara micro-choque ±0.01 na direção do fairValue.
  ticksSinceLastChange?: number
}

// ─── Correlação Inter-Ativos ─────────────────────────────────────────────────

/** Delta percentual do tick anterior — usado para calcular correlação entre ativos. */
export interface PreviousTickDelta {
  deltaPercent: number   // (finalPrice - prevPrice) / prevPrice
  cluster: AssetCluster
  state: string          // UF do clube (para rho regional)
}

// ─── Layer Result ─────────────────────────────────────────────────────────

export interface LayerResult {
  layer: string
  deltaPrice: number         // Contribuição desta camada no movimento de preço
  metadata?: Record<string, number | string | boolean>
}

// ─── Atribuicao causal do preco ───────────────────────────────────────────

export type PriceAttributionConfidence = 'alta' | 'media' | 'baixa'
export type EvidenceGrade = 'DIRECT' | 'CORRELATED' | 'DEGRADED'
export type DegradedReasonOwner =
  | 'MIGRATION'
  | 'ENGINE'
  | 'ORDER_FLOW'
  | 'NEWS_PIPELINE'
  | 'API_PARSER'
  | 'BACKFILL'
  | 'UNKNOWN'

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

export type CausalEventType =
  | 'NEWS'
  | 'ADMIN_ACTION'
  | 'ORDER_FLOW'
  | 'LAYER'
  | 'CONTROL'
  | 'SYNTHETIC_AGENT'
  | 'CORRELATION'
  | 'NUDGE'

export interface CausalEvent {
  id: string
  type: CausalEventType
  source: string
  occurredAt: string
  direction: 'up' | 'down' | 'neutral'
  magnitude: number
  layer?: string
  newsId?: string
  adminActionId?: string
  orderIds?: string[]
  orderIdsTruncated?: boolean
  title?: string
  impactCategory?: string
  sentiment?: number | string
  reasonCode?: string
  metadata?: Record<string, string | number | boolean>
}

/**
 * Ajuste manual de preço aplicado por admin entre ticks.
 * adjustPrice() muda state.currentPrice imediatamente, então o salto
 * old→new nunca apareceria no delta do tick seguinte; este registro pendente
 * vira CausalEvent ADMIN_ACTION na próxima atribuição persistida do ativo.
 */
export interface AdminPriceAdjustment {
  previousPrice: number
  newPrice: number
  occurredAt: string
  adminId?: string
  reason?: string
  actionType: 'ADJUST_PRICE'
}

export interface ActiveNewsImpact {
  newsId?: string
  title?: string
  source?: string
  impactCategory?: string
  sentiment?: number | string
  publishedAt?: string
  correlationId?: string
  magnitude: number
  durationTicks: number
  ticksRemaining: number
  qualityFlags: QualityFlag[]
}

export interface OrderFlowSnapshot {
  openBuyQty: number
  openSellQty: number
  marketBuyQty: number
  marketSellQty: number
  orderCount: number
  snapshotTakenAt: string
  orderSnapshotSource: 'DB' | 'MEMORY' | 'DISABLED' | 'UNAVAILABLE'
  topOrderIds: string[]
  orderIdsTruncated: boolean
  qualityFlags: QualityFlag[]
}

export interface TickInputSnapshot {
  tickId: string
  assetId: string
  ticker: string
  startedAt: string
  previousPrice: number
  pendingBuyVolume: number
  pendingSellVolume: number
  orderFlowSnapshot?: OrderFlowSnapshot
  activeNewsImpacts: ActiveNewsImpact[]
  sessionType: SessionType
}

export interface DirectEvidence {
  type: CausalEventType
  label: string
  eventId: string
  source: string
  occurredAt: string
}

export interface CorrelatedEvidence {
  type: 'NEWS' | 'ADMIN_ACTION' | 'ORDER_FLOW'
  label: string
  eventId?: string
  occurredAt?: string
  confidenceScore: number
}

export interface ValueAnalysisMovementEvidence {
  evidenceGrade: EvidenceGrade
  qualityFlags: QualityFlag[]
  directEvidence: DirectEvidence[]
  correlatedEvidence: CorrelatedEvidence[]
  degradedReason: string | null
  degradedOwner: DegradedReasonOwner | null
  primaryExplanation: string
  evidenceSentence: string
  caveatSentence: string
}

export interface LayerContribution {
  layer: string
  deltaPrice: number
  contributionPct: number
  direction: 'up' | 'down' | 'neutral'
  metadata?: Record<string, number | string | boolean>
}

export interface PriceAttribution {
  version: 1
  primaryCause: string
  primaryLayer: string | null
  confidence: PriceAttributionConfidence
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
  sessionType: SessionType
  layerContributions: LayerContribution[]
  appliedControls: string[]
  generatedAt: string
}

export interface PriceAttributionV2 {
  version: 2
  tickId: string
  tickCount: number
  tickStartedAt: string
  tickEndedAt: string
  primaryEventId: string | null
  primaryCause: string
  primaryLayer: string | null
  confidence: PriceAttributionConfidence
  explanation: string
  primaryExplanation: string
  evidenceSentence: string
  caveatSentence: string
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
  sessionType: SessionType
  layerContributions: LayerContribution[]
  causalEvents: CausalEvent[]
  inputSnapshot?: TickInputSnapshot
  executedOrderSummary?: {
    orderCount: number
    buyQuantity: number
    sellQuantity: number
    note: string
  }
  appliedControls: string[]
  qualityFlags: QualityFlag[]
  payloadBytes: number
  generatedAt: string
}

export type AnyPriceAttribution = PriceAttribution | PriceAttributionV2

export type AttributionParseResult =
  | { ok: true; value: AnyPriceAttribution; evidenceGrade: EvidenceGrade; qualityFlags: QualityFlag[] }
  | { ok: false; reason: string; qualityFlag: QualityFlag; evidenceGrade: 'DEGRADED'; qualityFlags: QualityFlag[] }

// ─── Order Book ──────────────────────────────────────────────────────────

export interface OrderBookEntry {
  orderId: string
  userId: string
  side: 'BUY' | 'SELL'
  type: 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT'
  quantity: number
  price: number
  createdAt: number
  planType?: 'JOGADOR' | 'CRAQUE' | 'LENDA'
  isOcoComponent?: boolean
}

// ─── Leader Election ─────────────────────────────────────────────────────

export interface LeaderState {
  isLeader: boolean
  leaderId: string
  ttl: number
  fencingToken: number
}

// ─── Admin Action ────────────────────────────────────────────────────────

export type AdminActionType =
  | 'INJECT_NEWS'
  | 'PAUSE_ASSET'
  | 'RESUME_ASSET'
  | 'ADJUST_PRICE'
  | 'HALT_ALL'
  | 'RESUME_ALL'
  | 'HALT_ASSET'            // Halt individual por admin (via REST /admin/motor/halt/:ticker)
  | 'RELEASE_HALT'          // Liberação de halt individual por admin
  | 'FORCE_CIRCUIT_BREAKER' // Força circuit breaker manual por admin

export interface AdminAction {
  type: AdminActionType
  assetId?: string
  payload: Record<string, unknown>
  adminId: string
  reason: string
  timestamp: number
}
