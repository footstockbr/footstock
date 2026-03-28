// ============================================================================
// Foot Stock — RBAC Matrix (5 roles x 21 recursos)
// ============================================================================

import type { AdminRole } from '@/lib/enums'

/** Recursos do sistema admin */
export type AdminResource =
  | 'users:read'
  | 'users:write'
  | 'users:suspend'
  | 'users:delete'
  | 'assets:read'
  | 'assets:write'
  | 'assets:halt'
  | 'assets:price'
  | 'motor:read'
  | 'motor:control'
  | 'news:read'
  | 'news:write'
  | 'news:delete'
  | 'leagues:read'
  | 'leagues:moderate'
  | 'forum:read'
  | 'forum:moderate'
  | 'financial:read'
  | 'financial:write'
  | 'admin:dashboard'
  | 'admin:audit'

/** Matriz de permissoes: role -> lista de recursos permitidos */
const PERMISSIONS: Record<AdminRole, AdminResource[]> = {
  SUPER_ADMIN: [
    'users:read',
    'users:write',
    'users:suspend',
    'users:delete',
    'assets:read',
    'assets:write',
    'assets:halt',
    'assets:price',
    'motor:read',
    'motor:control',
    'news:read',
    'news:write',
    'news:delete',
    'leagues:read',
    'leagues:moderate',
    'forum:read',
    'forum:moderate',
    'financial:read',
    'financial:write',
    'admin:dashboard',
    'admin:audit',
  ],
  ADMINISTRADOR: [
    'users:read',
    'users:write',
    'users:suspend',
    'assets:read',
    'assets:write',
    'assets:halt',
    'assets:price',
    'motor:read',
    'motor:control',
    'news:read',
    'news:write',
    'news:delete',
    'leagues:read',
    'leagues:moderate',
    'forum:read',
    'forum:moderate',
    'financial:read',
    'admin:dashboard',
  ],
  MONITOR: [
    'users:read',
    'assets:read',
    'motor:read',
    'news:read',
    'leagues:read',
    'forum:read',
    'financial:read',
    'admin:dashboard',
  ],
  EDITOR: [
    'news:read',
    'news:write',
    'news:delete',
    'assets:read',
    'admin:dashboard',
  ],
  MODERADOR: [
    'leagues:read',
    'leagues:moderate',
    'forum:read',
    'forum:moderate',
    'users:read',
    'admin:dashboard',
  ],
}

/**
 * Verifica se um role admin tem permissao para um recurso.
 *
 * @example
 * canAccess('MONITOR', 'motor:control') // false
 * canAccess('SUPER_ADMIN', 'users:delete') // true
 */
export function canAccess(role: AdminRole, resource: AdminResource): boolean {
  return PERMISSIONS[role]?.includes(resource) ?? false
}

/** Retorna todos os recursos que um role pode acessar */
export function getPermissions(role: AdminRole): AdminResource[] {
  return PERMISSIONS[role] ?? []
}
