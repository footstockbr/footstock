import 'server-only'

import { jwtVerify, createRemoteJWKSet } from 'jose'
import { createSupabaseServerClient } from '@/lib/supabase'
import { prisma } from '@/lib/prisma'
import type { User, AdminRole } from '@/types'

// ─── JWKS cache — carregado uma vez por instância, depois 100% local ──────────
//
// O Supabase usa ES256 (ECC P-256). A verificação com HS256 shared secret não
// funciona para esse algoritmo. createRemoteJWKSet faz fetch do JWKS na primeira
// chamada e cacheia em memória — sem rate-limiting nas chamadas subsequentes.
//
// Isso resolve o problema de 401 esporádico causado pelo rate-limit do Supabase
// quando múltiplas rotas chamam getUser() simultaneamente no carregamento da página.

const SUPABASE_JWKS = createRemoteJWKSet(
  new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL!}/auth/v1/.well-known/jwks.json`)
)

// ─── Obter usuário autenticado a partir da sessão Supabase ─────────────────────

export async function getAuthUser(): Promise<{ user: User; supabaseId: string } | null> {
  try {
    // 1. Ler sessão do cookie — sem chamada de rede ao Supabase Auth
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null

    // 2. Verificar JWT via JWKS (ES256) — sem chamada de rede após o primeiro fetch
    const { payload } = await jwtVerify(session.access_token, SUPABASE_JWKS)
    if (!payload.sub) return null

    // 3. Buscar usuário no banco
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
    })
    if (!dbUser) return null

    return {
      supabaseId: payload.sub,
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

export function hasPlan(userPlan: string, required: 'JOGADOR' | 'CRAQUE' | 'LENDA'): boolean {
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
  planType: string
  fsBalance: { toNumber(): number }
  marginBlocked: { toNumber(): number }
  tourCompleted: boolean
  ageVerificationPending: boolean
  adminRole?: string | null
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
    planType: dbUser.planType as User['planType'],
    fsBalance: dbUser.fsBalance.toNumber(),
    marginBlocked: dbUser.marginBlocked.toNumber(),
    tourCompleted: dbUser.tourCompleted,
    ageVerificationPending: dbUser.ageVerificationPending,
    adminRole: (dbUser.adminRole as User['adminRole']) ?? null,
    createdAt: dbUser.createdAt.toISOString(),
    updatedAt: dbUser.updatedAt.toISOString(),
  }
}
