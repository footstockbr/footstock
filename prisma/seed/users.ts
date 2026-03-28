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
    planType: 'LENDA',
    adminRole: 'SUPER_ADMIN',
    fsBalance: 999999,
    favoriteClub: 'flamengo',
  },
  {
    email: 'admin@foot-stock.test',
    password: 'Test@1234!Admin',
    name: 'Administrador Teste',
    cpf: '111.444.777-35',
    planType: 'LENDA',
    adminRole: 'ADMINISTRADOR',
    fsBalance: 100000,
    favoriteClub: 'palmeiras',
  },
  {
    email: 'monitor@foot-stock.test',
    password: 'Test@1234!Monitor',
    name: 'Monitor Teste',
    cpf: '333.444.555-67',
    planType: 'CRAQUE',
    adminRole: 'MONITOR',
    fsBalance: 50000,
    favoriteClub: 'corinthians',
  },
  {
    email: 'editor@foot-stock.test',
    password: 'Test@1234!Editor',
    name: 'Editor Teste',
    cpf: '444.555.666-78',
    planType: 'CRAQUE',
    adminRole: 'EDITOR',
    fsBalance: 50000,
    favoriteClub: 'sao-paulo',
  },
  {
    email: 'moderador@foot-stock.test',
    password: 'Test@1234!Mod',
    name: 'Moderador Teste',
    cpf: '555.666.777-89',
    planType: 'CRAQUE',
    adminRole: 'MODERADOR',
    fsBalance: 50000,
    favoriteClub: 'atletico-mg',
  },
  {
    email: 'craque@foot-stock.test',
    password: 'Test@1234!Craque',
    name: 'Usuário Craque',
    cpf: '666.777.888-90',
    planType: 'CRAQUE',
    adminRole: undefined,
    fsBalance: 25000,
    favoriteClub: 'fluminense',
  },
  {
    email: 'jogador@foot-stock.test',
    password: 'Test@1234!Jogador',
    name: 'Usuário Jogador',
    cpf: '777.888.999-01',
    planType: 'JOGADOR',
    adminRole: undefined,
    fsBalance: 10000,
    favoriteClub: 'gremio',
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
      user_metadata: { name: user.name, cpfHash },
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
        investorProfile: 'MODERADO',
      },
      update: {
        planType: user.planType,
        adminRole: user.adminRole ?? null,
        fsBalance: user.fsBalance,
      },
    })

    // 3. Consentimentos LGPD (todos os 4 purposes aceitos para usuários de teste)
    const purposes = ['TERMS', 'MARKETING', 'ANALYTICS', 'THIRD_PARTY'] as const
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
