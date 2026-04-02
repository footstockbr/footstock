import { NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { adminAuditService } from '@/lib/services/shared'
import type { AdminRole } from '@/types'

interface AdminAuthResult {
  user: { id: string; adminRole?: string | null; name: string }
  response?: never
}
interface AdminAuthBlocked {
  user?: never
  response: NextResponse
}

/**
 * Helper para verificar autenticação + role admin em route handlers.
 * Retorna { user } se autorizado, ou { response } com o erro HTTP a retornar.
 *
 * Uso:
 *   const { user, response } = await requireAdminRole(AdminRole.MONITOR)(request)
 *   if (response) return response
 */
export function requireAdminRole(minRole: AdminRole) {
  return async (request: Request): Promise<AdminAuthResult | AdminAuthBlocked> => {
    const auth = await getAuthUser()
    if (!auth) {
      return {
        response: NextResponse.json(
          { error: { code: 'AUTH-001', message: 'Sessão expirada. Faça login novamente.' } },
          { status: 401 }
        ),
      }
    }

    if (!hasAdminRole(auth.user.adminRole, minRole)) {
      // Registrar tentativa não autorizada no audit trail
      await adminAuditService.log({
        adminId: auth.user.id,
        action: 'UNAUTHORIZED_ATTEMPT',
        details: {
          required: minRole,
          actual: auth.user.adminRole ?? 'NONE',
          path: request.url,
        },
      })
      return {
        response: NextResponse.json(
          { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
          { status: 403 }
        ),
      }
    }

    return { user: auth.user }
  }
}
