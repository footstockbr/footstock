/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Criar Prisma client diretamente (não usar lib/prisma por causa de 'server-only')
const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

/**
 * DEV ONLY: Seed de usuários de teste para validar /admin/usuarios
 * POST /api/v1/dev/seed-users
 *
 * Cria usuários de todos os tipos:
 * - Planos: JOGADOR, CRAQUE, LENDA
 * - Status: ACTIVE, SUSPENDED, BANNED
 * - Perfis: INICIANTE, CONSERVADOR, ARROJADO
 * - Admin roles: SUPER_ADMIN, ADMINISTRADOR, MONITOR, MODERADOR
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development' },
      { status: 403 }
    )
  }

  try {
    const createdUsers = []

    // Usuários por plano
    const plans = ['JOGADOR', 'CRAQUE', 'LENDA']
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i]
      const user = await prisma.user.create({
        data: {
          email: `user-${plan.toLowerCase()}-${i}@foot-stock.test`,
          name: `${plan} User ${i + 1}`,
          planType: plan as any,
          status: 'ACTIVE',
          investorProfile: 'INICIANTE',
          birthDate: new Date('1990-01-01'),
          favoriteClub: 'URU3',
          fsBalance: 50000 + i * 10000,
          cpfHash: `cpf-hash-${plan}-${i}`,
          userType: 'NORMAL',
        },
      })
      createdUsers.push(user)
    }

    // Usuários com status SUSPENDED
    const user_suspended = await prisma.user.create({
      data: {
        email: 'user-suspended@foot-stock.test',
        name: 'Suspended User',
        planType: 'CRAQUE',
        status: 'SUSPENDED',
        investorProfile: 'MODERADO',
        suspendedAt: new Date(),
        suspensionReason: 'Violação de termos de serviço',
        birthDate: new Date('1995-05-15'),
        favoriteClub: 'POR3',
        fsBalance: 25000,
        cpfHash: 'cpf-hash-suspended',
        userType: 'NORMAL',
      },
    })
    createdUsers.push(user_suspended)

    // Usuários com status BANNED
    const user_banned = await prisma.user.create({
      data: {
        email: 'user-banned@foot-stock.test',
        name: 'Banned User',
        planType: 'JOGADOR',
        status: 'BANNED',
        investorProfile: 'ARROJADO',
        suspendedAt: new Date(),
        suspensionReason: 'Fraude detectada',
        birthDate: new Date('1985-12-25'),
        favoriteClub: 'TIM3',
        fsBalance: 0,
        cpfHash: 'cpf-hash-banned',
        userType: 'NORMAL',
      },
    })
    createdUsers.push(user_banned)

    // Usuários com diferentes perfis de investidor
    const profiles = ['INICIANTE', 'CONSERVADOR', 'MODERADO', 'ARROJADO', 'ESPECULADOR']
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i]
      const user = await prisma.user.create({
        data: {
          email: `investor-${profile.toLowerCase()}-${i}@foot-stock.test`,
          name: `${profile} Investor ${i + 1}`,
          planType: 'LENDA',
          status: 'ACTIVE',
          investorProfile: profile as any,
          birthDate: new Date('1988-06-10'),
          favoriteClub: 'COL3',
          fsBalance: 100000,
          cpfHash: `cpf-hash-investor-${profile}-${i}`,
          userType: 'NORMAL',
        },
      })
      createdUsers.push(user)
    }

    // Usuários Admin (staff — SEM planType, SEM saldo de player)
    const adminRoles = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR']
    for (let i = 0; i < adminRoles.length; i++) {
      const role = adminRoles[i]
      const user = await prisma.user.create({
        data: {
          email: `admin-${role.toLowerCase()}-${i}@foot-stock.test`,
          name: `${role} Admin ${i + 1}`,
          // Staff nao tem planType (M055).
          planType: null,
          status: 'ACTIVE',
          adminRole: role as any,
          investorProfile: 'CONSERVADOR',
          birthDate: new Date('1980-03-20'),
          favoriteClub: 'URU3',
          // Saldo operacional fixo para staff (nao escala por plano).
          fsBalance: 10000,
          cpfHash: `cpf-hash-admin-${role}-${i}`,
          userType: 'ADMIN',
        },
      })
      createdUsers.push(user)
    }

    // Usuários ativos (online simulation)
    for (let i = 0; i < 5; i++) {
      const user = await prisma.user.create({
        data: {
          email: `active-user-${i}@foot-stock.test`,
          name: `Active User ${i + 1}`,
          planType: 'CRAQUE',
          status: 'ACTIVE',
          investorProfile: 'MODERADO',
          birthDate: new Date('1992-07-14'),
          favoriteClub: 'POR3',
          fsBalance: 75000,
          cpfHash: `cpf-hash-active-${i}`,
          userType: 'NORMAL',
        },
      })
      createdUsers.push(user)
    }

    return NextResponse.json({
      ok: true,
      message: `${createdUsers.length} seed users created`,
      data: {
        totalCreated: createdUsers.length,
        byPlan: {
          JOGADOR: createdUsers.filter(u => u.planType === 'JOGADOR').length,
          CRAQUE: createdUsers.filter(u => u.planType === 'CRAQUE').length,
          LENDA: createdUsers.filter(u => u.planType === 'LENDA').length,
        },
        byStatus: {
          ACTIVE: createdUsers.filter(u => u.status === 'ACTIVE').length,
          SUSPENDED: createdUsers.filter(u => u.status === 'SUSPENDED').length,
          BANNED: createdUsers.filter(u => u.status === 'BANNED').length,
        },
        byRole: {
          SUPER_ADMIN: createdUsers.filter(u => u.adminRole === 'SUPER_ADMIN').length,
          ADMINISTRADOR: createdUsers.filter(u => u.adminRole === 'ADMINISTRADOR').length,
          MONITOR: createdUsers.filter(u => u.adminRole === 'MONITOR').length,
          EDITOR: createdUsers.filter(u => u.adminRole === 'EDITOR').length,
          MODERADOR: createdUsers.filter(u => u.adminRole === 'MODERADOR').length,
        },
        users: createdUsers.map(u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          plan: u.planType,
          status: u.status,
          adminRole: u.adminRole,
        })),
      },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      { status: 500 }
    )
  }
}
