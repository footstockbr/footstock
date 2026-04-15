// ============================================================================
// Foot Stock Motor — Tipos e Interfaces Centrais
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
  // L4 — OFI: estado do decaimento exponencial (OFI_t = rho*OFI_{t-1} + (1-rho)*ofi_raw_t)
  ofiState: number
  // L9 — DailyVolTarget: acumulador de variação percentual do dia (0–1)
  dailyVolAccum: number
  // L9 — DailyVolTarget: multiplicador de sigma aplicado em L1/L3 (1.0 = normal, 0.0 = freeze)
  dailySigmaMultiplier: number
  // Multiplicador de volatilidade por sessão (SessionManager): CLOSED=0, PRE_OPENING=0.3, TRADING=1.0, etc.
  volatilityMultiplier: number
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
  metadata?: Record<string, number>
}

// ─── Order Book ──────────────────────────────────────────────────────────

export interface OrderBookEntry {
  orderId: string
  userId: string
  side: 'BUY' | 'SELL'
  type: 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT'
  quantity: number
  price: number
  createdAt: number
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
