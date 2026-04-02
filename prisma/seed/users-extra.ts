/**
 * Seed: usuários de edge case — estados especiais não cobertos em users-local.ts / users.ts
 * Cobre: UserStatus SUSPENDED/BANNED, ageVerificationPending, tourCompleted=false,
 *        CLUB_PARTNER adminRole, marginBlocked > 0, investorProfile null.
 * Idempotente (upsert por email).
 */
import { prisma } from '@/lib/prisma'
import { hashCPF } from '@/lib/utils/crypto'
import { randomUUID } from 'crypto'

export const EXTRA_USERS = [
  {
    email: 'suspenso@foot-stock.test',
    name: 'Usuário Suspenso',
    cpf: '100.200.300-40',
    planType: 'JOGADOR' as const,
    status: 'SUSPENDED' as const,
    adminRole: null,
    fsBalance: 2000,
    favoriteClub: 'FLA3',
    tourCompleted: true,
    investorProfile: 'INICIANTE' as const,
    marginBlocked: 0,
    ageVerificationPending: false,
  },
  {
    email: 'banido@foot-stock.test',
    name: 'Usuário Banido',
    cpf: '200.300.400-50',
    planType: 'JOGADOR' as const,
    status: 'BANNED' as const,
    adminRole: null,
    fsBalance: 0,
    favoriteClub: 'PAL3',
    tourCompleted: true,
    investorProfile: 'AVANCADO' as const,
    marginBlocked: 0,
    ageVerificationPending: false,
  },
  {
    email: 'age-pending@foot-stock.test',
    name: 'Verificação Pendente',
    cpf: '300.400.500-60',
    planType: 'JOGADOR' as const,
    status: 'ACTIVE' as const,
    adminRole: null,
    fsBalance: 2000,
    favoriteClub: 'COR3',
    tourCompleted: false,
    investorProfile: null,
    marginBlocked: 0,
    ageVerificationPending: true, // US-001 DEGRADED: FlagCheck indisponível
  },
  {
    email: 'sem-tour@foot-stock.test',
    name: 'Tour Não Concluído',
    cpf: '400.500.600-70',
    planType: 'CRAQUE' as const,
    status: 'ACTIVE' as const,
    adminRole: null,
    fsBalance: 5000,
    favoriteClub: 'GRE3',
    tourCompleted: false, // US-003 EDGE: pular tour
    investorProfile: null, // US-003 DEGRADED: falha ao salvar perfil
    marginBlocked: 0,
    ageVerificationPending: false,
  },
  {
    email: 'margem-bloqueada@foot-stock.test',
    name: 'Margin Call Ativo',
    cpf: '500.600.700-80',
    planType: 'LENDA' as const,
    status: 'ACTIVE' as const,
    adminRole: null,
    fsBalance: 1200,
    favoriteClub: 'INT3',
    tourCompleted: true,
    investorProfile: 'AVANCADO' as const,
    marginBlocked: 800, // posição short com margin bloqueada (edge case POS)
    ageVerificationPending: false,
  },
  {
    email: 'fa-investidor@foot-stock.test',
    name: 'Fã Investidor',
    cpf: '700.800.900-02',
    planType: 'JOGADOR' as const,
    status: 'ACTIVE' as const,
    adminRole: null,
    fsBalance: 2000,
    favoriteClub: 'FLA3',
    tourCompleted: true,
    investorProfile: 'FA' as const, // cobre o enum FA de InvestorProfile
    marginBlocked: 0,
    ageVerificationPending: false,
  },
]

export async function seedUsersExtra() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:users-extra] Seeds não executam em produção.')
  }

  for (const user of EXTRA_USERS) {
    const cpfHash = hashCPF(user.cpf)

    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: randomUUID(),
        email: user.email,
        name: user.name,
        cpfHash,
        planType: user.planType,
        status: user.status,
        adminRole: user.adminRole,
        fsBalance: user.fsBalance,
        marginBlocked: user.marginBlocked,
        favoriteClub: user.favoriteClub,
        tourCompleted: user.tourCompleted,
        investorProfile: user.investorProfile,
        ageVerificationPending: user.ageVerificationPending,
      },
      update: {
        planType: user.planType,
        status: user.status,
        adminRole: user.adminRole,
        fsBalance: user.fsBalance,
        marginBlocked: user.marginBlocked,
        investorProfile: user.investorProfile,
        ageVerificationPending: user.ageVerificationPending,
      },
    })

    console.log(`[seed:users-extra] ✓ ${user.email} (status=${user.status}, plan=${user.planType})`)
  }
}
