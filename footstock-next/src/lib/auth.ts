import 'server-only'

import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { prisma } from '@/lib/prisma'
import type { User, AdminRole } from '@/types'

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
    planType: dbUser.planType as User['planType'],
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
