/**
 * Seed de usuários para DEV LOCAL (sem Supabase Auth).
 * Usa cuid() como ID — não vincula com auth.users.
 * Para produção/staging com Supabase real, usar users.ts.
 */
import { prisma } from '@/lib/prisma'
import { hashCPF } from '@/lib/utils/crypto'
import type { AdminRole, PlanType } from '@prisma/client'
import { randomUUID } from 'crypto'

interface TestUser {
  email: string
  name: string
  cpf: string
  planType: PlanType
  adminRole?: AdminRole
  fsBalance: number
  favoriteClub: string
}

const TEST_USERS: TestUser[] = [
  {
    email: 'superadmin@foot-stock.test',
    name: 'Super Admin',
    cpf: '529.982.247-25',
    planType: 'JOGADOR',
    adminRole: 'SUPER_ADMIN',
    fsBalance: 2000,
    favoriteClub: 'URU3',
  },
  {
    email: 'admin@foot-stock.test',
    name: 'Administrador Teste',
    cpf: '111.444.777-35',
    planType: 'JOGADOR',
    adminRole: 'ADMINISTRADOR',
    fsBalance: 2000,
    favoriteClub: 'POR4',
  },
  {
    email: 'monitor@foot-stock.test',
    name: 'Monitor Teste',
    cpf: '333.444.555-67',
    planType: 'JOGADOR',
    adminRole: 'MONITOR',
    fsBalance: 2000,
    favoriteClub: 'TIM3',
  },
  {
    email: 'editor@foot-stock.test',
    name: 'Editor Teste',
    cpf: '444.555.666-78',
    planType: 'JOGADOR',
    adminRole: 'EDITOR',
    fsBalance: 2000,
    favoriteClub: 'TRI4',
  },
  {
    email: 'moderador@foot-stock.test',
    name: 'Moderador Teste',
    cpf: '555.666.777-89',
    planType: 'JOGADOR',
    adminRole: 'MODERADOR',
    fsBalance: 2000,
    favoriteClub: 'GAL3',
  },
  {
    email: 'craque@foot-stock.test',
    name: 'Usuário Craque',
    cpf: '666.777.888-90',
    planType: 'CRAQUE',
    adminRole: undefined,
    fsBalance: 5000,
    favoriteClub: 'GUE4',
  },
  {
    email: 'lenda@foot-stock.test',
    name: 'Usuário Lenda',
    cpf: '888.999.000-12',
    planType: 'LENDA',
    adminRole: undefined,
    fsBalance: 25000,
    favoriteClub: 'VOL4',
  },
  {
    email: 'jogador@foot-stock.test',
    name: 'Usuário Jogador',
    cpf: '777.888.999-01',
    planType: 'JOGADOR',
    adminRole: undefined,
    fsBalance: 2000,
    favoriteClub: 'IMO3',
  },
]

export async function seedUsersLocal() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:users-local] Seeds não executam em produção.')
  }

  for (const user of TEST_USERS) {
    const cpfHash = hashCPF(user.cpf)

    const created = await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: randomUUID(),
        email: user.email,
        name: user.name,
        cpfHash,
        planType: user.planType,
        adminRole: user.adminRole ?? null,
        fsBalance: user.fsBalance,
        favoriteClub: user.favoriteClub,
        tourCompleted: true,
        investorProfile: 'INTERMEDIARIO',
      },
      update: {
        planType: user.planType,
        adminRole: user.adminRole ?? null,
        fsBalance: user.fsBalance,
      },
    })

    await prisma.consent.upsert({
      where: { userId_purpose: { userId: created.id, purpose: 'ESSENTIAL' } },
      create: { userId: created.id, purpose: 'ESSENTIAL', granted: true, grantedAt: new Date() },
      update: {},
    })

    console.log(`[seed:users-local] ✓ ${user.email} (${user.planType}${user.adminRole ? '/' + user.adminRole : ''})`)
  }
}
