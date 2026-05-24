import 'server-only'

import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { readAuthjsSession } from '@/lib/auth/authjs-session'
import type { User } from '@/types'

// ─── Higiene de cookies legados ────────────────────────────────────────────────
//
// Pós-decomissão Supabase: não há mais provider externo concorrente. Mantemos
// `clearDualCookies` para remover quaisquer cookies `sb-*` legados que tenham
// sobrado no browser, além dos cookies Auth.js no logout.

const AUTHJS_COOKIE_PREFIXES = [
  'next-auth.',
  '__Secure-next-auth.',
  '__Host-next-auth.',
  'authjs.',
  '__Secure-authjs.',
  '__Host-authjs.',
]
const SUPABASE_COOKIE_PREFIX = 'sb-'

/**
 * Limpa cookies de sessão Auth.js e cookies `sb-*` legados na resposta atual.
 *
 * Decisões de design:
 *  - NÃO chamamos NextAuth.signOut() apesar do spec literal mencioná-lo:
 *    o root `auth.ts` (handler) importa de `@/lib/auth` (este arquivo),
 *    invocar signOut() daqui criaria import cycle. Para session strategy
 *    'database', remover o cookie é funcionalmente equivalente —
 *    a Session row no DB fica órfã e expira via TTL natural do Adapter.
 *  - Prefix matching em vez de lista de nomes: tolerante a variações
 *    `__Secure-` / `__Host-` e `next-auth.` legacy vs `authjs.` v5+.
 *    Caso NextAuth introduza novo prefix em release futuro, atualizar
 *    `AUTHJS_COOKIE_PREFIXES` (lint via grep mensal sugerido).
 */
export async function clearDualCookies(): Promise<void> {
  const cookieStore = await cookies()
  for (const c of cookieStore.getAll()) {
    const name = c.name
    if (
      name.startsWith(SUPABASE_COOKIE_PREFIX) ||
      AUTHJS_COOKIE_PREFIXES.some((p) => name.startsWith(p))
    ) {
      try {
        cookieStore.delete(name)
      } catch {
        // Read-only context (RSC sem mutação) — tolerar; middleware fará a próxima limpeza.
      }
    }
  }
}

// ─── Obter usuário autenticado a partir da sessão Auth.js ──────────────────────
//
// Retorna o id canônico do usuário (Prisma) em `userId` e o usuário serializado.

export async function getAuthUser(): Promise<{ user: User; userId: string } | null> {
  try {
    // DEV local fallback: fs_dev_auth cookie em desenvolvimento.
    if (process.env.NODE_ENV !== 'production') {
      const cookieStore = await cookies()
      const devAuthRaw = cookieStore.get('fs_dev_auth')?.value
      const devAuthEmail = devAuthRaw ? decodeURIComponent(devAuthRaw) : null
      if (devAuthEmail) {
        const devUser = await prisma.user.findUnique({ where: { email: devAuthEmail } })
        if (devUser) {
          return { userId: devUser.id, user: serializeUser(devUser) }
        }
      }
    }

    // Cookie de sessão Auth.js v5 `(__Secure-)authjs.session-token`.
    const authjs = await readAuthjsSession()
    if (authjs?.id) {
      const dbUser = await prisma.user.findUnique({ where: { id: authjs.id } })
      if (dbUser) {
        return { userId: dbUser.id, user: serializeUser(dbUser) }
      }
    }

    return null
  } catch {
    return null
  }
}

// ─── Verificar se usuário tem adminRole mínimo ─────────────────────────────────
// Implementação em src/lib/utils/admin-roles.ts (sem server-only, seguro para client)
export { hasAdminRole } from '@/lib/utils/admin-roles'

// ─── Verificar se usuário tem plano mínimo ─────────────────────────────────────

const PLAN_LEVELS = { JOGADOR: 1, CRAQUE: 2, LENDA: 3 }

export function hasPlan(userPlan: string | null | undefined, required: 'JOGADOR' | 'CRAQUE' | 'LENDA'): boolean {
  if (!userPlan) return false
  return (PLAN_LEVELS[userPlan as keyof typeof PLAN_LEVELS] ?? 0) >=
    (PLAN_LEVELS[required] ?? 99)
}

// ─── Serialização — converte Prisma model para tipo de resposta ────────────────

export function serializeUser(dbUser: {
  id: string
  email: string
  name: string
  phone?: string | null
  birthDate: Date | null
  favoriteClub: string | null
  favoriteClubDisplayName?: string | null
  userType: string
  investorProfile: string | null
  planType: string | null
  fsBalance: { toNumber(): number }
  marginBlocked: { toNumber(): number }
  tourCompleted: boolean
  ageVerificationPending: boolean
  adminRole?: string | null
  version?: number
  createdAt: Date
  updatedAt: Date
}): User {
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    phone: dbUser.phone ?? null,
    birthDate: dbUser.birthDate?.toISOString().split('T')[0] ?? '',
    favoriteClub: dbUser.favoriteClub ?? '',
    favoriteClubDisplayName: dbUser.favoriteClubDisplayName ?? null,
    userType: dbUser.userType as User['userType'],
    investorProfile: (dbUser.investorProfile ?? 'INICIANTE') as User['investorProfile'],
    planType: (dbUser.planType ?? null) as User['planType'],
    fsBalance: dbUser.fsBalance.toNumber(),
    marginBlocked: dbUser.marginBlocked.toNumber(),
    tourCompleted: dbUser.tourCompleted,
    ageVerificationPending: dbUser.ageVerificationPending,
    adminRole: (dbUser.adminRole as User['adminRole']) ?? null,
    version: dbUser.version ?? 0,
    createdAt: dbUser.createdAt.toISOString(),
    updatedAt: dbUser.updatedAt.toISOString(),
  }
}
