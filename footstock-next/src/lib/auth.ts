import 'server-only'

import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { createSupabaseServerClient } from '@/lib/supabase'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import type { User, AdminRole } from '@/types'

// ─── NXAUTH-04A — Kill switch + detecção de conflito Auth.js vs Supabase ───────
//
// Cenário: usuário pode ter cookie Auth.js + cookie Supabase apontando para
// users rows DIFERENTES (mudou conta no Supabase via SDK direto, voltou).
// Silent precedence = wrong identity. Esta camada é precondição de NXAUTH-04
// (switchover); detectIdentityConflict deve ser chamado pelo getAuthUser()
// novo a cada request quando AMBOS providers retornam identidade.

export interface IdentityClaim {
  id: string
  email: string | null | undefined
}

/**
 * Compara identidade Auth.js vs Supabase. Retorna true quando id OU email
 * normalizado divergem. Inputs nulos NUNCA são conflito (1 só provider ativo).
 */
export function detectIdentityConflict(
  authjsUser: IdentityClaim | null | undefined,
  supabaseUser: IdentityClaim | null | undefined,
): boolean {
  if (!authjsUser || !supabaseUser) return false
  if (authjsUser.id !== supabaseUser.id) return true
  const a = (authjsUser.email ?? '').trim().toLowerCase()
  const s = (supabaseUser.email ?? '').trim().toLowerCase()
  if (a && s && a !== s) return true
  return false
}

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
 * Limpa AMBOS cookies (Auth.js + Supabase) na resposta atual.
 *
 * Decisões de design (revisão adversarial item 016):
 *  - NÃO chamamos NextAuth.signOut() apesar do spec literal mencioná-lo:
 *    o root `auth.ts` (handler) importa de `@/lib/auth` (este arquivo),
 *    invocar signOut() daqui criaria import cycle. Para session strategy
 *    'database', remover o cookie é funcionalmente equivalente —
 *    a Session row no DB fica órfã e expira via TTL natural do Adapter.
 *  - Session row órfã no DB será explicitamente revogada em item 018
 *    (NXAUTH-04 SWITCHOVER) quando `getAuthUser()` Auth.js-first invocar
 *    este path; lá teremos `userId` em escopo para `prisma.session.deleteMany`.
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

/**
 * Reage a conflito de identidade. Em modo strict (default produção),
 * limpa cookies e retorna null forçando re-auth. Em modo non-strict
 * (debug/recovery), apenas loga e devolve `preferred` para fallback.
 */
export async function handleIdentityConflict<T>(
  preferred: T,
  authjsUser: IdentityClaim,
  supabaseUser: IdentityClaim,
): Promise<T | null> {
  const meta = {
    authjs_user_id: authjsUser.id,
    supabase_user_id: supabaseUser.id,
    authjs_email_hash: authjsUser.email ? hashTag(authjsUser.email) : null,
    supabase_email_hash: supabaseUser.email ? hashTag(supabaseUser.email) : null,
  }
  console.warn('[auth] dual-cookie identity conflict detected', meta)
  Sentry.captureMessage('auth.dual_cookie_identity_conflict', {
    level: 'warning',
    tags: { source: 'auth', kind: 'dual_cookie_conflict' },
    extra: meta,
  })

  if (env.AUTH_DUAL_COOKIE_STRICT === 'false') {
    return preferred
  }
  await clearDualCookies()
  return null
}

/** Hash determinístico curto para tag em telemetria sem vazar email PII. */
function hashTag(value: string): string {
  let h = 0
  const v = value.trim().toLowerCase()
  for (let i = 0; i < v.length; i++) {
    h = (h << 5) - h + v.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(16).padStart(8, '0')
}

// ─── Obter usuário autenticado a partir da sessão Supabase ─────────────────────

export async function getAuthUser(): Promise<{ user: User; supabaseId: string } | null> {
  try {
    // DEV local fallback: fs_dev_auth cookie bypassa Supabase em desenvolvimento
    if (process.env.NODE_ENV !== 'production') {
      const cookieStore = await cookies()
      const devAuthRaw = cookieStore.get('fs_dev_auth')?.value
      const devAuthEmail = devAuthRaw ? decodeURIComponent(devAuthRaw) : null
      if (devAuthEmail) {
        const devUser = await prisma.user.findUnique({ where: { email: devAuthEmail } })
        if (devUser) {
          return { supabaseId: devUser.id, user: serializeUser(devUser) }
        }
      }
    }

    // Usar getUser() em vez de getSession()+jwtVerify():
    // - getUser() valida o token com Supabase Auth (network call)
    // - Se o token expirou, tenta refresh automaticamente
    // - createSupabaseServerClient() tem setAll funcional (persiste cookies refreshados)
    //
    // O root middleware.ts já faz refresh preventivo em todas as requests,
    // mas esta chamada serve como safety net para Server Components que
    // podem ser renderizados sem passar pelo middleware (e.g., revalidation).
    const supabase = await createSupabaseServerClient()
    const { data: { user: supabaseUser } } = await supabase.auth.getUser()
    if (!supabaseUser?.id) return null

    // Buscar usuário no banco — adminRole e planType SEMPRE do banco
    const dbUser = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    })
    if (!dbUser) return null

    return {
      supabaseId: supabaseUser.id,
      user: serializeUser(dbUser),
    }
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
