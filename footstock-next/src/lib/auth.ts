import 'server-only'

import { jwtVerify } from 'jose'
import { createSupabaseServerClient } from '@/lib/supabase'
import { prisma } from '@/lib/prisma'
import type { User, AdminRole } from '@/types'

// ─── Obter usuário autenticado a partir da sessão Supabase ─────────────────────
//
// Usa verificação LOCAL do JWT (SUPABASE_JWT_SECRET) em vez de supabase.auth.getUser().
// getUser() faz uma chamada de rede ao Supabase Auth a cada invocação — com 4+ requests
// simultâneos no carregamento da página, o Supabase rate-limita alguns deles, causando
// 401 esporádicos mesmo com token válido. getSession() + jwtVerify() é 100% local.

export async function getAuthUser(): Promise<{ user: User; supabaseId: string } | null> {
  try {
    // 1. Ler sessão do cookie — sem chamada de rede
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null

    // 2. Verificar assinatura JWT localmente — sem chamada de rede
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(session.access_token, secret)
    if (!payload.sub) return null

    // 3. Buscar usuário no banco (única chamada de rede necessária)
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

const ADMIN_ROLE_LEVELS: Record<AdminRole, number> = {
  CLUB_PARTNER: 0,
  MONITOR: 1,
  EDITOR: 2,
  MODERADOR: 3,
  ADMINISTRADOR: 4,
  SUPER_ADMIN: 5,
}

export function hasAdminRole(
  userAdminRole: string | null | undefined,
  required: AdminRole
): boolean {
  if (!userAdminRole) return false
  const userLevel = ADMIN_ROLE_LEVELS[userAdminRole as AdminRole] ?? 0
  const requiredLevel = ADMIN_ROLE_LEVELS[required] ?? 99
  return userLevel >= requiredLevel
}

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
