/**
 * Funções puras de verificação de role admin.
 * Sem dependências de servidor — seguro para uso em Client Components.
 * Importado por: MotorPageClient.tsx e outros client components que precisam de role checks.
 * API routes e server components usam @/lib/auth que re-exporta estas funções.
 */

import type { AdminRole } from '@/types'

export const ADMIN_ROLE_LEVELS: Record<AdminRole, number> = {
  CLUB_PARTNER: 0,
  MONITOR: 1,
  EDITOR: 2,
  MODERADOR: 3,
  ADMINISTRADOR: 4,
  SUPER_ADMIN: 5,
}

export function hasAdminRole(
  userAdminRole: string | null | undefined,
  required: AdminRole
): boolean {
  if (!userAdminRole) return false
  const userLevel = ADMIN_ROLE_LEVELS[userAdminRole as AdminRole] ?? 0
  const requiredLevel = ADMIN_ROLE_LEVELS[required] ?? 99
  return userLevel >= requiredLevel
}
