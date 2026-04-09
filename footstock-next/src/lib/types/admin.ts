/**
 * Admin Dashboard — Tipos e DTOs
 * Módulo: module-22-admin-dashboard-motor
 */

export type MotorStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED'

export interface AdminDashboardDTO {
  totalUsers: number
  newUsers24h: number
  activeSubscriptions: number
  MRR: number // em BRL
  totalOrders24h: number
  ordersVsTarget: {
    today: number
    target: number // NSM: 500
    percentAchieved: number
  }
  motorStatus: MotorStatus
  topAssets: { ticker: string; volume: number; priceChange: number }[]
  // User stats panel
  userStats: {
    online: number
    suspended: number
    postsPendingModeration: number
    inactiveByPeriod: {
      d1: number
      d7: number
      d15: number
      d30: number
      d30plus: number
    }
    planDistribution: {
      plan: string
      count: number
      pct: number
    }[]
  }
  _cacheHit?: boolean
}

export interface EngagementMetricsDTO {
  DAU: number
  WAU: number
  MAU: number
  retentionRate: number // % semana-sobre-semana
  peakConcurrentUsers: number
  totalFsMovimentados24h: number
  avgSessionDuration: number | null // segundos, null se não disponível
  topFeatures: string[]
  // Campos adicionais para o painel de engajamento completo
  fsBreakdown: {
    compras: number
    vendas: number
    dividendos: number
    taxas: number
  }
  topAsset: { ticker: string; volume: number } | null
  topPnlUser: { name: string; pnl: number } | null
  peakHourRange: string // ex: "19h–22h"
  inactiveByPeriod: {
    d1: number
    d7: number
    d15: number
    d30: number
    d30plus: number
  }
  totalUsers: number
  _approximated?: boolean
}

export interface CohortWeek {
  weekLabel: string
  newUsers: number
  week1: number
  week2: number
  week3: number
  week4: number
}

export interface AdminMarketActionLog {
  id: string
  adminId: string
  action: string
  targetTicker?: string | null
  details?: unknown
  timestamp: string // ISO
  adminName?: string
}

export interface RevenueDayPoint {
  date: string // ISO date
  mrr: number
}

export interface FinancialMetricsDTO {
  mrr: number
  arr: number
  churnRate: number
  newSubscriptions24h: number
  cancelledThisMonth: number
  cancelledPrevMonth: number
  planDistribution: Record<string, number>
  volume24h: number
  revenueByGateway: { gateway: string; revenue: number }[]
  gatewayStatus: { gateway: string; lastActivity: string | null; transactionCount: number }[]
  mrrHistory: { date: string; value: number }[]
}

export interface EngagementDayPoint {
  date: string // ISO date
  dau: number
  wau?: number
}

export interface ImpactMatrixDTO {
  financeiraCritica: number
  esportivaMajoritaria: number
  mercadoAtivos: number
  integridadeSaude: number
  institucional: number
  esportivaMenor: number
}

export enum AdminNav {
  DASHBOARD = '/admin',
  MOTOR = '/admin/motor',
  ENGAJAMENTO = '/admin/engajamento',
  NOTICIAS = '/admin/noticias',
  USUARIOS = '/admin/usuarios',
  FINANCEIRO = '/admin/financeiro',
  MODERACAO = '/admin/moderacao',
  CLUBES = '/admin/clubes',
  PATROCINADORES = '/admin/patrocinadores',
  AFILIADOS = '/admin/afiliados',
}

// ─── Presentation-layer DTOs (admin components) ──────────────────────────────

/** NewsItem como retornado pela API admin (sentiment já convertido para string) */
export interface AdminNewsItem {
  id: string
  title: string
  source: string
  url: string
  ticker: string
  sentiment: 'positive' | 'negative' | 'neutral'
  category: string
  status: string
  publishedAt: string
  injectedAt: string
}

/** Subconjunto de AdminNewsItem usado pelo formulário de edição */
export interface AdminNewsFormItem {
  id: string
  title: string
  ticker: string
  sentiment: 'positive' | 'negative' | 'neutral'
  category: string
}

/** UserItem como retornado pela API admin (campos essenciais para listagem) */
export interface AdminUserItem {
  id: string
  name: string
  email: string
  planType: string
  status: string
  adminRole?: string | null
  suspendedAt?: string | null
  createdAt: string
  fsBalance?: number
}

/** Subconjunto de AdminUserItem usado pelo menu de ações */
export interface AdminUserActionItem {
  id: string
  name: string
  status: string
  adminRole?: string | null
}

/** GatewayConfig como retornado pela API admin/gateways/config */
export interface GatewayConfig {
  code: 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL'
  name: string
  icon: string
  color: string
  active: boolean
  splitPercent: number
  creditFeePercent: number
  creditSettlement: string
  debitFeePercent: number
  debitSettlement: string
  pixFeePercent: number
  pixSettlement: string
  webhookEndpoint?: string | null
  webhookApiKey?: string | null
  webhookSecret?: string | null
}
