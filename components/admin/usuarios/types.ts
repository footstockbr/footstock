// Shared types and constants for the admin/usuarios components

export type AdminRole = 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'MONITOR' | 'EDITOR' | 'MODERADOR'
export type PlanType = 'JOGADOR' | 'CRAQUE' | 'LENDA'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED'
export type Tab = 'jogadores' | 'administradores'

export interface AdminUser {
  id: string
  name: string
  email: string
  adminRole: AdminRole | null
  status: string
  planType: string
  createdAt?: string
}

export interface RegularUser {
  id: string
  name: string
  email: string
  planType: PlanType
  fsBalance: number
  status: UserStatus
  createdAt: string
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export const ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR']

export const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  BANNED: 'Banido',
}

export const PLAN_BADGE: Record<PlanType, string> = {
  JOGADOR: 'border-zinc-700 bg-zinc-800 text-zinc-300',
  CRAQUE: 'border-amber-700/50 bg-amber-900/30 text-amber-400',
  LENDA: 'border-yellow-500/50 bg-yellow-900/30 text-yellow-400',
}

export const STATUS_BADGE: Record<UserStatus, string> = {
  ACTIVE: 'border-emerald-700/50 bg-emerald-900/30 text-emerald-400',
  SUSPENDED: 'border-orange-700/50 bg-orange-900/30 text-orange-400',
  BANNED: 'border-red-700/50 bg-red-900/30 text-red-400',
}
