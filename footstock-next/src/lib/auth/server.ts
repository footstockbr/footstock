import { headers, cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { hasPlanAccess } from '@/lib/auth/planAccess'
import { readAuthjsSession, decodeAuthjsToken, isSessionInvalidated } from '@/lib/auth/authjs-session'
import type { PlanType } from '@/lib/enums'
import type { User } from '@/types/models'
import { evaluateAccountAccess } from '@/lib/auth/account-status'

/**
 * Terceiro ponto de entrada de autenticacao do app (alem de `getAuthUser` em
 * src/lib/auth.ts e `withAuth` em src/app/api/middleware.ts). Aplica a MESMA
 * politica de conta bloqueada dos outros dois — 2026-09-03. Sem isto, as rotas
 * que importam daqui seriam um buraco por onde uma conta suspensa continuaria
 * escrevendo, que e exatamente o defeito que a politica veio fechar.
 *
 * Aqui tambem o bloqueio colapsa em `null` (401 nos callers): a assinatura e
 * `{ user } | null`. Fail-closed. O 403 com motivo sai por `getAuthUserOrBlock`.
 */
function blocked(headerStore: Headers, user: unknown): boolean {
  return (
    evaluateAccountAccess(user as { status?: string | null; suspensionReason?: string | null }, {
      pathname: headerStore.get('x-fs-path') ?? undefined,
      method: headerStore.get('x-fs-method') ?? undefined,
    }) !== null
  )
}

export async function getAuthUser(): Promise<{ user: User } | null> {
  const headerStore = await headers()
  const cookieStore = await cookies()

  const authHeader =
    headerStore.get('authorization') ?? headerStore.get('Authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  // Bearer token (clientes nativos): JWE Auth.js emitido por /api/v1/auth/login.
  if (bearer) {
    const payload = await decodeAuthjsToken(bearer)
    if (payload?.id) {
      const dbUser = await prisma.user.findUnique({ where: { id: payload.id } })
      // Invalida token emitido antes da ultima troca de senha (outras sessoes).
      if (dbUser && !isSessionInvalidated(dbUser.passwordChangedAt, payload.iat)) {
        if (blocked(headerStore, dbUser)) return null
        return { user: dbUser as unknown as User }
      }
    }
    return null
  }

  // Cookie de sessão Auth.js v5 (`__Secure-authjs.session-token`).
  const authjs = await readAuthjsSession()
  if (authjs?.id) {
    const dbUser = await prisma.user.findUnique({ where: { id: authjs.id } })
    if (dbUser && !isSessionInvalidated(dbUser.passwordChangedAt, authjs.iat)) {
      if (blocked(headerStore, dbUser)) return null
      return { user: dbUser as unknown as User }
    }
  }

  // DEV local fallback: cookie HttpOnly fs_dev_auth.
  if (process.env.NODE_ENV !== 'production') {
    const devAuthEmail = cookieStore.get('fs_dev_auth')?.value
    if (devAuthEmail) {
      const devUser = await prisma.user.findUnique({ where: { email: devAuthEmail } })
      if (devUser) {
        if (blocked(headerStore, devUser)) return null
        return { user: devUser as unknown as User }
      }
    }
  }

  return null
}

export function hasPlan(userPlan: PlanType | null | undefined, requiredPlan: PlanType): boolean {
  return hasPlanAccess(userPlan, requiredPlan)
}
