/**
 * Seed: Usuários de demonstração para painel admin
 * Module: module-23-admin-usuarios-financeiro / TASK-5
 *
 * GUARD: Não executar em produção
 * Invariante: saldos por plano — Jogador FS$2.000, Craque FS$5.000, Lenda FS$25.000
 */

import type { PrismaClient } from '@prisma/client'

const DEMO_USERS = [
  {
    email: 'superadmin@foot-stock.dev',
    name: 'Admin Master',
    adminRole: 'SUPER_ADMIN' as const,
    planType: 'JOGADOR' as const,
    fsBalance: 2000,
    cpfHash: 'seed-cpf-hash-superadmin-0000000000000000000000000000000000000000000000000000',
    birthDate: new Date('1980-01-01'),
    favoriteClub: 'FLAM',
    investorProfile: 'AVANCADO' as const,
  },
  {
    email: 'admin@foot-stock.dev',
    name: 'João Administrador',
    adminRole: 'ADMIN' as const,
    planType: 'JOGADOR' as const,
    fsBalance: 2000,
    cpfHash: 'seed-cpf-hash-admin-000000000000000000000000000000000000000000000000000000000',
    birthDate: new Date('1985-03-15'),
    favoriteClub: 'PALM',
    investorProfile: 'INTERMEDIARIO' as const,
  },
  {
    email: 'monitor@foot-stock.dev',
    name: 'Maria Monitor',
    adminRole: 'MONITOR' as const,
    planType: 'JOGADOR' as const,
    fsBalance: 2000,
    cpfHash: 'seed-cpf-hash-monitor-0000000000000000000000000000000000000000000000000000000',
    birthDate: new Date('1990-06-20'),
    favoriteClub: 'CORI',
    investorProfile: 'INICIANTE' as const,
  },
  {
    email: 'editor@foot-stock.dev',
    name: 'Carlos Editor',
    adminRole: 'EDITOR' as const,
    planType: 'JOGADOR' as const,
    fsBalance: 2000,
    cpfHash: 'seed-cpf-hash-editor-00000000000000000000000000000000000000000000000000000000',
    birthDate: new Date('1992-09-10'),
    favoriteClub: 'SAOP',
    investorProfile: 'INTERMEDIARIO' as const,
  },
  {
    email: 'moderador@foot-stock.dev',
    name: 'Ana Moderadora',
    adminRole: 'MODERADOR' as const,
    planType: 'JOGADOR' as const,
    fsBalance: 2000,
    cpfHash: 'seed-cpf-hash-moderador-000000000000000000000000000000000000000000000000000000',
    birthDate: new Date('1995-12-05'),
    favoriteClub: 'GREM',
    investorProfile: 'INICIANTE' as const,
  },
  {
    email: 'usuario@foot-stock.dev',
    name: 'Pedro Usuário',
    adminRole: null,
    planType: 'JOGADOR' as const,
    fsBalance: 2000,
    cpfHash: 'seed-cpf-hash-user-000000000000000000000000000000000000000000000000000000000000',
    birthDate: new Date('1998-07-22'),
    favoriteClub: 'FLAM',
    investorProfile: 'INICIANTE' as const,
  },
  {
    email: 'craque@foot-stock.dev',
    name: 'Luiza Craque',
    adminRole: null,
    planType: 'CRAQUE' as const,
    fsBalance: 5000,
    cpfHash: 'seed-cpf-hash-craque-00000000000000000000000000000000000000000000000000000000',
    birthDate: new Date('1996-04-14'),
    favoriteClub: 'PALM',
    investorProfile: 'INTERMEDIARIO' as const,
  },
  {
    email: 'lenda@foot-stock.dev',
    name: 'Roberto Lenda',
    adminRole: null,
    planType: 'LENDA' as const,
    fsBalance: 25000,
    cpfHash: 'seed-cpf-hash-lenda-000000000000000000000000000000000000000000000000000000000',
    birthDate: new Date('1975-11-03'),
    favoriteClub: 'CORI',
    investorProfile: 'AVANCADO' as const,
  },
]

export async function seedAdminDemoUsers(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] Não executar seed de demo em produção! NODE_ENV=production detectado.')
  }

  console.log('[seed] Iniciando seed de usuários de demonstração...')

  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        adminRole: user.adminRole,
        planType: user.planType,
      },
      create: {
        email: user.email,
        name: user.name,
        cpfHash: user.cpfHash,
        birthDate: user.birthDate,
        favoriteClub: user.favoriteClub,
        investorProfile: user.investorProfile,
        adminRole: user.adminRole,
        planType: user.planType,
        fsBalance: user.fsBalance,
        userType: 'NORMAL',
      },
    })
    console.log(`[seed]   ✓ ${user.email} (${user.adminRole ?? 'USER'} / ${user.planType})`)
  }

  console.log(`[seed] Seed de usuários concluído — ${DEMO_USERS.length} usuários criados/atualizados`)
}
