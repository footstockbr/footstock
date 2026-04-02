import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { hashCPF } from '@/lib/utils/crypto'
import type { AdminRole, PlanType } from '@prisma/client'

interface TestUser {
  email: string
  password: string
  name: string
  cpf: string
  planType: PlanType
  adminRole?: AdminRole
  fsBalance: number
  favoriteClub: string
}

/**
 * CREDENCIAIS DE TESTE — NÃO usar em produção.
 * Ver DEV-CREDENTIALS.md para a tabela completa.
 */
export const TEST_USERS: TestUser[] = [
  {
    email: 'superadmin@foot-stock.test',
    password: 'Test@1234!SuperAdmin',
    name: 'Super Admin',
    cpf: '529.982.247-25',
    planType: 'JOGADOR',
    adminRole: 'SUPER_ADMIN',
    fsBalance: 2000,
    favoriteClub: 'URU3',
  },
  {
    email: 'admin@foot-stock.test',
    password: 'Test@1234!Admin',
    name: 'Administrador Teste',
    cpf: '111.444.777-35',
    planType: 'JOGADOR',
    adminRole: 'ADMINISTRADOR',
    fsBalance: 2000,
    favoriteClub: 'POR4',
  },
  {
    email: 'monitor@foot-stock.test',
    password: 'Test@1234!Monitor',
    name: 'Monitor Teste',
    cpf: '333.444.555-67',
    planType: 'JOGADOR',
    adminRole: 'MONITOR',
    fsBalance: 2000,
    favoriteClub: 'TIM3',
  },
  {
    email: 'editor@foot-stock.test',
    password: 'Test@1234!Editor',
    name: 'Editor Teste',
    cpf: '444.555.666-78',
    planType: 'JOGADOR',
    adminRole: 'EDITOR',
    fsBalance: 2000,
    favoriteClub: 'TRI4',
  },
  {
    email: 'moderador@foot-stock.test',
    password: 'Test@1234!Mod',
    name: 'Moderador Teste',
    cpf: '555.666.777-89',
    planType: 'JOGADOR',
    adminRole: 'MODERADOR',
    fsBalance: 2000,
    favoriteClub: 'GAL3',
  },
  {
    email: 'craque@foot-stock.test',
    password: 'Test@1234!Craque',
    name: 'Usuário Craque',
    cpf: '666.777.888-90',
    planType: 'CRAQUE',
    adminRole: undefined,
    fsBalance: 5000,
    favoriteClub: 'GUE4',
  },
  {
    email: 'lenda@foot-stock.test',
    password: 'Test@1234!Lenda',
    name: 'Usuário Lenda',
    cpf: '888.999.000-12',
    planType: 'LENDA',
    adminRole: undefined,
    fsBalance: 25000,
    favoriteClub: 'VOL4',
  },
  {
    email: 'jogador@foot-stock.test',
    password: 'Test@1234!Jogador',
    name: 'Usuário Jogador',
    cpf: '777.888.999-01',
    planType: 'JOGADOR',
    adminRole: undefined,
    fsBalance: 2000,
    favoriteClub: 'IMO3',
  },
  {
    email: 'clube-parceiro@foot-stock.test',
    password: 'Test@1234!Clube',
    name: 'Clube Parceiro FC',
    cpf: '600.700.800-91',
    planType: 'JOGADOR',
    adminRole: 'CLUB_PARTNER',
    fsBalance: 0,
    favoriteClub: 'FLA3',
  },
]

export async function seedUsers() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:users] Seeds não executam em produção.')
  }

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  )

  for (const user of TEST_USERS) {
    const cpfHash = hashCPF(user.cpf)

    // 1. Criar no Supabase Auth (ou confirmar existência)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        name: user.name,
        cpfHash,
        ...(user.adminRole ? { adminRole: user.adminRole } : {}),
      },
    })

    if (authError && !authError.message.includes('already been registered')) {
      console.error(`[seed:users] Erro ao criar ${user.email}:`, authError.message)
      continue
    }

    // ID do usuário (novo ou existente)
    let userId: string
    if (authData?.user) {
      userId = authData.user.id
    } else {
      const { data: listData } = await supabase.auth.admin.listUsers()
      const existing = listData?.users.find(u => u.email === user.email)
      if (!existing) {
        console.error(`[seed:users] Não encontrou ${user.email} após conflito`)
        continue
      }
      userId = existing.id
    }

    // 2. Upsert no Prisma
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: userId,
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

    // 3. Consentimentos LGPD (todos os 4 purposes aceitos para usuários de teste)
    const purposes = ['ESSENTIAL', 'MARKETING', 'ANALYTICS', 'DATA_TERCEIROS'] as const
    for (const purpose of purposes) {
      await prisma.consent.upsert({
        where: { userId_purpose: { userId, purpose } },
        create: { userId, purpose, granted: true, grantedAt: new Date() },
        update: {},
      })
    }

    console.log(`[seed:users] ✓ ${user.email} (${user.planType}${user.adminRole ? '/' + user.adminRole : ''})`)
  }
}
