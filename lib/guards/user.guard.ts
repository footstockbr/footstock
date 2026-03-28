// ============================================================================
// Foot Stock — Type Guards de Usuário
// ============================================================================

import { PLAN_TYPE, ADMIN_ROLE } from '@/lib/enums';
import type { PlanType, AdminRole } from '@/lib/enums';
import type { User } from '@/types/models';

// ---------------------------------------------------------------------------
// ST006: Guards de usuário
// ---------------------------------------------------------------------------

const PLAN_TYPE_VALUES = new Set<string>(Object.values(PLAN_TYPE));
const ADMIN_ROLE_VALUES = new Set<string>(Object.values(ADMIN_ROLE));

/** Verifica se o valor é um objeto User válido */
export function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.cpfHash === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.planType === 'string' &&
    PLAN_TYPE_VALUES.has(obj.planType) &&
    typeof obj.fsBalance === 'number' &&
    typeof obj.version === 'number' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
}

/** Verifica se o valor é um PlanType válido */
export function isPlanType(value: unknown): value is PlanType {
  return typeof value === 'string' && PLAN_TYPE_VALUES.has(value);
}

/** Verifica se o valor é um AdminRole válido */
export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && ADMIN_ROLE_VALUES.has(value);
}

/** Verifica se o usuário possui role de admin (qualquer nível) */
export function isAdmin(user: User): boolean {
  return user.adminRole !== null;
}

/** Verifica se o usuário é super admin */
export function isSuperAdmin(user: User): boolean {
  return user.adminRole === ADMIN_ROLE.SUPER_ADMIN;
}
