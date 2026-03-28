// ============================================================================
// Foot Stock Motor — Tipos e Interfaces Centrais
// ============================================================================

// ─── Clusters ─────────────────────────────────────────────────────────────

export type AssetCluster = 'A_TOP' | 'A_MID' | 'A_SMALL' | 'B_LIQUID' | 'B_ILLIQ'

export interface ClusterParams {
  cluster: AssetCluster
  baseVolume: number          // Volume base para simulação
  drift: number               // Tendência diária (ex: -0.0002)
  garchAlpha: number          // Peso do choque recente (α)
  garchBeta: number           // Persistência da volatilidade (β)
  lambdaKyle: number          // Impacto de preço por unidade de volume (λ)
  spread: number              // Spread bid-ask base
  maxTickChange: number       // Variação máxima por tick (ex: 0.03 = 3%)
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
}

// ─── Session ──────────────────────────────────────────────────────────────

export type SessionType = 'PRE_ABERTURA' | 'NEGOCIACAO' | 'CALL' | 'AFTER_MARKET' | 'FECHADO'

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
  currentPrice: number
  openPrice: number
  highPrice: number
  lowPrice: number
  closePrice: number         // Close do dia anterior (âncora GARCH)
  volume: number
  variance: number           // Variância GARCH atual (σ²)
  pendingBuyVolume: number   // OFI: volume comprador pendente
  pendingSellVolume: number  // OFI: volume vendedor pendente
  isPaused: boolean          // Circuit breaker ou ação admin
  newsImpact: number         // Magnitude de notícia ativa (0.0 a 1.0)
  newsImpactTicks: number    // Ticks restantes do efeito da notícia
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

export interface AdminAction {
  type: AdminActionType
  assetId?: string
  payload: Record<string, unknown>
  adminId: string
  reason: string
  timestamp: number
}
