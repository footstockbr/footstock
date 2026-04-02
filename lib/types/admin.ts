// ============================================================================
// Foot Stock — Tipos do módulo Admin Dashboard & Motor (module-22)
// INT-075, INT-076, INT-077, INT-078
// ============================================================================

import type { AdminRole } from '@/lib/enums'

// ---------------------------------------------------------------------------
// Enums locais
// ---------------------------------------------------------------------------

export enum AdminNav {
  DASHBOARD = '/admin',
  MOTOR = '/admin/motor',
  ENGAGEMENT = '/admin/engajamento',
  NEWS = '/admin/noticias',
  USERS = '/admin/usuarios',
  FINANCIAL = '/admin/financeiro',
  MODERATION = '/admin/moderacao',
  SPONSORS = '/admin/patrocinadores',
}

export type MotorStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED'

// ---------------------------------------------------------------------------
// DTOs de API
// ---------------------------------------------------------------------------

export interface AdminDashboardDTO {
  totalUsers: number
  newUsers24h: number
  activeSubscriptions: number
  MRR: number // BRL
  totalOrders24h: number
  ordersVsTarget: {
    today: number
    target: number // NSM: 500
    percentAchieved: number
  }
  motorStatus: MotorStatus
  topAssets: { ticker: string; volume: number; priceChange: number }[]
}

export interface EngagementMetricsDTO {
  DAU: number
  WAU: number
  MAU: number
  retentionRate: number
  peakConcurrentUsers: number
  totalFsMovimentados24h: number
  avgSessionDuration: number | null
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

export interface EngagementDayPoint {
  date: string // YYYY-MM-DD
  dau: number
  wau: number
}

export interface RevenueDayPoint {
  date: string // YYYY-MM-DD
  mrr: number  // BRL
}

export interface AdminMarketActionLog {
  id: string
  adminId: string
  action: string
  ticker?: string | null
  details?: unknown
  ipAddress?: string | null
  createdAt: Date
  admin?: { name: string; email: string } | null
}

// ---------------------------------------------------------------------------
// Interfaces de sessão admin
// ---------------------------------------------------------------------------

export interface AdminSessionData {
  valid: boolean
  adminRole: AdminRole | null
  userId: string | null
}

// ---------------------------------------------------------------------------
// Nav items para AdminSidebar
// ---------------------------------------------------------------------------

export interface AdminNavItem {
  href: string
  label: string
  resource: import('@/lib/auth/canAccess').AdminResource
  icon: string // nome do ícone Lucide
}
