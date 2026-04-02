// ============================================================================
// Foot Stock — Auth Middleware Helpers para Route Handlers (Next.js 15)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { canAccess, type AdminResource } from '@/lib/auth/canAccess'
import { hasPlanAccess } from '@/lib/auth/planAccess'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import type { AdminRole, PlanType } from '@/lib/enums'
import type { User } from '@/types/models'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type AuthContext = { user: User }
export type RouteHandler = (req: NextRequest, context: AuthContext) => Promise<NextResponse>

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

// ---------------------------------------------------------------------------
// withAuth — valida sessao Supabase e carrega usuario do BANCO
// ---------------------------------------------------------------------------

/**
 * Middleware de autenticacao para Route Handlers.
 * Valida Bearer token via Supabase e carrega o usuario do banco.
 *
 * SEGURANCA: adminRole e planType SEMPRE lidos do banco.
 * Claims JWT sao nao-confiaveis para autorizacao (podem ser forjados).
 */
export function withAuth(handler: RouteHandler) {
  return async (req: NextRequest) => {
    try {
      const supabase = createServerClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
          cookies: {
            getAll: () => [],
            setAll: () => {
              /* noop — route handlers nao manipulam cookies */
            },
          },
        }
      )

      const authHeader = req.headers.get('Authorization')
      const token = authHeader?.replace('Bearer ', '')

      if (!token) {
        // DEV local fallback: autenticação por cookie HttpOnly (sem Supabase)
        if (process.env.NODE_ENV !== 'production') {
          const devAuthRaw = req.cookies.get('fs_dev_auth')?.value
          const devAuthEmail = devAuthRaw ? decodeURIComponent(devAuthRaw) : null
          if (devAuthEmail) {
            const devUser = await prisma.user.findUnique({ where: { email: devAuthEmail } })
            if (devUser) {
              return handler(req, { user: devUser as unknown as User })
            }
          }
        }
        return errorResponse(ERROR_CODES.AUTH_010, ERROR_MESSAGES['AUTH-010'], 401)
      }

      const {
        data: { user: supabaseUser },
        error,
      } = await supabase.auth.getUser(token)

      if (error || !supabaseUser) {
        return errorResponse(ERROR_CODES.AUTH_010, ERROR_MESSAGES['AUTH-010'], 401)
      }

      // SEGURANCA: adminRole e planType SEMPRE lidos do banco.
      // Claims JWT sao nao-confiaveis para autorizacao (podem ser forjados).
      const dbUser = await prisma.user.findUnique({ where: { id: supabaseUser.id } })

      if (!dbUser) {
        return errorResponse(ERROR_CODES.AUTH_010, ERROR_MESSAGES['AUTH-010'], 401)
      }

      // Invariante de domínio: contas administrativas são sempre operacionais
      // e não podem carregar plano pago.
      const normalizedUser =
        dbUser.adminRole && dbUser.planType !== 'JOGADOR'
          ? await prisma.user.update({
              where: { id: dbUser.id },
              data: { planType: 'JOGADOR' },
            })
          : dbUser

      return handler(req, { user: normalizedUser as unknown as User })
    } catch {
      return errorResponse(ERROR_CODES.SYS_001, ERROR_MESSAGES['SYS-001'], 500)
    }
  }
}

// ---------------------------------------------------------------------------
// withAdmin — exige role admin com recurso especifico
// ---------------------------------------------------------------------------

/**
 * Middleware que exige role admin com acesso ao recurso especificado.
 * Compoe sobre withAuth — o usuario ja esta autenticado.
 */
export function withAdmin(resource: AdminResource) {
  return (handler: RouteHandler) => {
    return withAuth(async (req, { user }) => {
      if (!user.adminRole) {
        return errorResponse(ERROR_CODES.AUTH_009, ERROR_MESSAGES['AUTH-009'], 403)
      }

      if (!canAccess(user.adminRole as AdminRole, resource)) {
        return errorResponse(ERROR_CODES.ADMIN_050, ERROR_MESSAGES['ADMIN-050'], 403)
      }

      return handler(req, { user })
    })
  }
}

// ---------------------------------------------------------------------------
// withPlan — exige plano minimo
// ---------------------------------------------------------------------------

/**
 * Middleware que exige plano minimo.
 * Compoe sobre withAuth — o usuario ja esta autenticado.
 */
export function withPlan(requiredPlan: PlanType) {
  return (handler: RouteHandler) => {
    return withAuth(async (req, { user }) => {
      if (!hasPlanAccess(user.planType as PlanType, requiredPlan)) {
        return errorResponse(ERROR_CODES.ORD_008, ERROR_MESSAGES['ORD-008'], 403)
      }

      return handler(req, { user })
    })
  }
}
