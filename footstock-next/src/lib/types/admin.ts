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

export interface EngagementDayPoint {
  date: string // ISO date
  dau: number
  wau?: number
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
}

/** Subconjunto de AdminUserItem usado pelo menu de ações */
export interface AdminUserActionItem {
  id: string
  name: string
  status: string
  adminRole?: string | null
}
