// ============================================================================
// FootStock — Auth Middleware Helpers para Route Handlers (Next.js 15)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { decodeAuthjsToken } from '@/lib/auth/authjs-session'
import { prisma } from '@/lib/prisma'
import { canAccess, type AdminResource } from '@/lib/auth/canAccess'
import { hasPlanAccess } from '@/lib/auth/planAccess'
import { recordPaidFeatureUsage } from '@/lib/auth'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import type { AdminRole, PlanType } from '@/lib/enums'
import type { User } from '@/types/models'

// Allowlist canonica de campos do User entregues ao handler. Substitui o
// denylist antigo (sanitizeUser strip de passwordHash/cpfHash) por defesa
// no nivel do query: campos sensiveis NUNCA saem do banco para handlers.
// Adicionar nova coluna sensivel em schema.prisma exige decisao explicita
// de incluir aqui — failure-mode passa de "lembrar de stripar" para
// "lembrar de incluir", que e o lado seguro.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  birthDate: true,
  planType: true,
  status: true,
  adminRole: true,
  investorProfile: true,
  tourCompleted: true,
  tourSkippedAt: true,
  favoriteClub: true,
  fsBalance: true,
  marginBlocked: true,
  referredByCode: true,
  favoriteClubDisplayName: true,
  bio: true,
  suspendedAt: true,
  suspensionReason: true,
  userType: true,
  version: true,
  emailVerified: true,
  image: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect

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

// E2E-2026-05-22: descobri via E2E que GET /api/v1/me ecoava `user` inteiro,
// incluindo passwordHash (bcrypt) e cpfHash. Original fix: denylist via
// sanitizeUser. Codex P2#5 (2026-05-23): convertido para allowlist via
// SAFE_USER_SELECT — campos sensiveis NUNCA saem do banco, eliminando
// a janela onde codigo handler novo poderia esquecer de stripar.

// ---------------------------------------------------------------------------
// withAuth — valida sessao Auth.js e carrega usuario do BANCO
// ---------------------------------------------------------------------------

/**
 * Carrega o usuario do banco aplicando o allowlist SAFE_USER_SELECT e a
 * invariante de dominio (staff ADMIN/CLUB_PARTNER nao possui planType).
 */
async function loadSafeUser(userId: string) {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: SAFE_USER_SELECT,
  })
  if (!dbUser) return null

  // Invariante: contas administrativas/institucionais nao possuem plano de player.
  if (dbUser.adminRole && dbUser.planType !== null) {
    return prisma.user.update({
      where: { id: dbUser.id },
      data: { planType: null },
      select: SAFE_USER_SELECT,
    })
  }
  return dbUser
}

/**
 * Middleware de autenticacao para Route Handlers.
 *
 * Resolucao de identidade (Auth.js v5, pos-decomissao Supabase):
 *  1. Bearer token / ?token= → JWE Auth.js (clientes nativos, EventSource)
 *  2. Cookie de sessao Auth.js via auth() (browser fetch sem Bearer)
 *  3. DEV: cookie HttpOnly fs_dev_auth
 *
 * SEGURANCA: adminRole e planType SEMPRE lidos do banco.
 * Claims JWT sao nao-confiaveis para autorizacao (podem ser forjados).
 */
export function withAuth(handler: RouteHandler) {
  return async (req: NextRequest) => {
    try {
      const authHeader = req.headers.get('Authorization')
      // SSE clients (EventSource) cannot set headers — accept ?token= query param as fallback
      const queryToken = req.nextUrl.searchParams.get('token')
      const token = authHeader?.replace('Bearer ', '') ?? queryToken ?? undefined

      // ── Caminho Bearer/query token: decodifica JWE Auth.js ──────────────────
      if (token) {
        const payload = await decodeAuthjsToken(token)
        if (!payload?.id) {
          return errorResponse(ERROR_CODES.AUTH_010, ERROR_MESSAGES['AUTH-010'], 401)
        }
        const user = await loadSafeUser(payload.id)
        if (!user) {
          return errorResponse(ERROR_CODES.AUTH_010, ERROR_MESSAGES['AUTH-010'], 401)
        }
        return handler(req, { user: user as unknown as User })
      }

      // ── Caminho cookie de sessao Auth.js (browser) ──────────────────────────
      try {
        const session = await auth()
        if (session?.user?.id) {
          const user = await loadSafeUser(session.user.id)
          if (user) {
            return handler(req, { user: user as unknown as User })
          }
        }
      } catch { /* Auth.js indisponivel — segue para dev fallback / 401 */ }

      // ── DEV local fallback: cookie HttpOnly (sem Supabase) ──────────────────
      if (process.env.NODE_ENV !== 'production') {
        const devAuthRaw = req.cookies.get('fs_dev_auth')?.value
        const devAuthEmail = devAuthRaw ? decodeURIComponent(devAuthRaw) : null
        if (devAuthEmail) {
          const devUser = await prisma.user.findUnique({
            where: { email: devAuthEmail },
            select: SAFE_USER_SELECT,
          })
          if (devUser) {
            return handler(req, { user: devUser as unknown as User })
          }
        }
      }

      return errorResponse(ERROR_CODES.AUTH_010, ERROR_MESSAGES['AUTH-010'], 401)
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

      // FIX-09: acesso concedido. Se a assinatura ja expirou mas esta na graca de
      // 7 dias (planType ainda pago), tornar o uso observavel SEM cortar acesso.
      // Fire-and-forget: o container web e persistente (Railway), entao a promise
      // completa sem bloquear a resposta; fail-open por dentro de recordPaidFeatureUsage.
      if (requiredPlan !== 'JOGADOR') {
        void recordPaidFeatureUsage({ userId: user.id, requiredPlan }).catch(() => {})
      }

      return handler(req, { user })
    })
  }
}
