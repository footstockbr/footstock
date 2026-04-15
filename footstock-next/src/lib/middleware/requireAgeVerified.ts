// T-023: Middleware guard — bloqueia acesso a áreas restritas para usuários
// com ageVerificationPending=true.
// Retorna AUTH-012 (403) com mensagem clara.

import { NextRequest, NextResponse } from 'next/server'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import type { AuthContext, RouteHandler } from '@/app/api/middleware'
import { withAuth } from '@/app/api/middleware'

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

/**
 * Middleware que exige verificação de maioridade concluída.
 * Compõe sobre withAuth — o usuário já está autenticado.
 *
 * Uso: `export const GET = withAgeVerified(handler)`
 * Ou combinado: `export const GET = withPlan('CRAQUE')(withAgeVerified(handler))`
 */
export function withAgeVerified(handler: RouteHandler) {
  return withAuth(async (req: NextRequest, { user }: AuthContext) => {
    if (user.ageVerificationPending) {
      return errorResponse(
        ERROR_CODES.AUTH_012,
        ERROR_MESSAGES['AUTH-012'],
        403
      )
    }

    return handler(req, { user })
  })
}
