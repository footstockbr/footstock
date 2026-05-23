// ============================================================================
// FootStock — Admin ClubUser CRUD
// POST: Criar representante de clube (SUPER_ADMIN only)
// GET: Listar representantes com filtro por clube
// Rastreabilidade: TASK-015 sub-item 4, US-025
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'

const CreateClubUserSchema = z.object({
  clubTicker: z.string().min(1, 'Ticker do clube obrigatório'),
  email: z.string().email('E-mail inválido'),
  name: z.string().min(2, 'Nome obrigatório (mínimo 2 caracteres)'),
  temporaryPassword: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})

/** POST /api/v1/admin/clubs/credentials — Criar novo representante de clube */
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: { code: 'AUTH-001', message: 'Não autorizado' } }, { status: 401 })
  }

  if (auth.user.adminRole !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: { code: 'AUTH-002', message: 'Apenas SUPER_ADMIN pode gerenciar representantes de clubes.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const parsed = CreateClubUserSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VAL_001', message: 'Dados inválidos', fieldErrors: parsed.error.flatten().fieldErrors } },
      { status: 422 }
    )
  }

  const { clubTicker, email, name, temporaryPassword } = parsed.data

  // Validar que o clubTicker existe como ativo ativo na plataforma
  const asset = await prisma.asset.findUnique({
    where: { ticker: clubTicker.toUpperCase() },
    select: { ticker: true, displayName: true, isActive: true },
  })

  if (!asset) {
    return NextResponse.json(
      { error: { code: 'CLUB_002', message: `Clube "${clubTicker}" não encontrado na plataforma.` } },
      { status: 404 }
    )
  }

  if (!asset.isActive) {
    return NextResponse.json(
      { error: { code: 'CLUB_003', message: `Clube "${asset.ticker}" está inativo.` } },
      { status: 422 }
    )
  }

  // Verificar email duplicado
  const existingUser = await prisma.clubUser.findUnique({ where: { email } })
  if (existingUser) {
    return NextResponse.json(
      { error: { code: 'CLUB_004', message: 'Já existe um representante com este e-mail.' } },
      { status: 409 }
    )
  }

  const passwordHash = await bcrypt.hash(temporaryPassword, 12)

  const clubUser = await prisma.clubUser.create({
    data: {
      clubTicker: asset.ticker,
      email,
      passwordHash,
      name,
      role: 'VIEWER',
      isActive: true,
      createdBy: auth.user.id,
    },
    select: {
      id: true,
      clubTicker: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  })

  return NextResponse.json(
    { success: true, data: { ...clubUser, clubName: asset.displayName } },
    { status: 201 }
  )
}

/** GET /api/v1/admin/clubs/credentials — Listar representantes de clubes */
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: { code: 'AUTH-001', message: 'Não autorizado' } }, { status: 401 })
  }

  if (auth.user.adminRole !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: { code: 'AUTH-002', message: 'Acesso negado' } },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const clubFilter = searchParams.get('clubTicker')

  const clubUsers = await prisma.clubUser.findMany({
    where: clubFilter ? { clubTicker: clubFilter.toUpperCase() } : undefined,
    select: {
      id: true,
      clubTicker: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      asset: { select: { displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const data = clubUsers.map((cu) => ({
    id: cu.id,
    clubTicker: cu.clubTicker,
    clubName: cu.asset.displayName,
    email: cu.email,
    name: cu.name,
    role: cu.role,
    isActive: cu.isActive,
    lastLoginAt: cu.lastLoginAt,
    createdAt: cu.createdAt,
  }))

  return NextResponse.json({ success: true, data })
}
