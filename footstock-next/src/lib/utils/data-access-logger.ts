// ============================================================================
// Foot Stock — HOF: withDataAccessLog
// Registra automaticamente acessos a dados pessoais (LGPD Art. 37)
// Fire-and-forget: não bloqueia a response principal
// Rastreabilidade: INT-105, TASK-3/ST002
// ============================================================================

import type { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { consentService } from '@/lib/services/ConsentService'

/**
 * HOF que envolve um handler autenticado e registra o acesso a dados pessoais.
 *
 * Uso:
 *   export const GET = withDataAccessLog(handler, 'profile')
 *   export const GET = withDataAccessLog(adminHandler, 'admin_view', (ctx) => ctx.targetUserId)
 */
export function withDataAccessLog(
  handler: (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>,
  dataType: string,
  getTargetUserId?: (ctx: AuthContext) => string
) {
  async function innerHandler(req: NextRequest, ctx: AuthContext) {
    const response = await handler(req, ctx)

    const targetUserId = getTargetUserId ? getTargetUserId(ctx) : ctx.user.id
    const accessedBy = ctx.user.id

    // Fire-and-forget — usa setImmediate para não bloquear a response
    setImmediate(() => {
      void consentService.logDataAccess({
        userId: targetUserId,
        accessedBy,
        dataType,
        endpoint: req.nextUrl.pathname,
        reason: accessedBy !== targetUserId ? 'admin_access' : undefined,
        ip: req.headers.get('x-forwarded-for') ?? undefined,
      })
    })

    return response
  }

  return withAuth(innerHandler as never)
}
