// ============================================================================
// FootStock — Admin ClubUser CRUD (por ID)
// GET: Detalhes de um representante
// PATCH: Atualizar dados (email, senha, nome)
// PUT /deactivate e /reactivate: handled via PATCH { isActive }
// DELETE: Desativar (soft delete via isActive = false)
// Rastreabilidade: TASK-015 sub-item 4, US-025
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'

type RouteParams = { params: Promise<{ id: string }> }

const UpdateClubUserSchema = z.object({
  email: z.string().email('E-mail inválido').optional(),
  name: z.string().min(2).optional(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Pelo menos um campo deve ser informado' })

async function requireSuperAdmin() {
  const auth = await getAuthUser()
  if (!auth) return null
  if (auth.user.adminRole !== 'SUPER_ADMIN') return null
  return auth
}

/** GET /api/v1/admin/clubs/credentials/[id] — Detalhes de um representante */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await requireSuperAdmin()
  if (!auth) {
    return NextResponse.json({ error: { code: 'AUTH-002', message: 'Acesso negado' } }, { status: 403 })
  }

  const { id } = await params
  const clubUser = await prisma.clubUser.findUnique({
    where: { id },
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
      creator: { select: { name: true, email: true } },
    },
  })

  if (!clubUser) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Representante não encontrado' } }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    data: {
      id: clubUser.id,
      clubTicker: clubUser.clubTicker,
      clubName: clubUser.asset.displayName,
      email: clubUser.email,
      name: clubUser.name,
      role: clubUser.role,
      isActive: clubUser.isActive,
      lastLoginAt: clubUser.lastLoginAt,
      createdAt: clubUser.createdAt,
      createdBy: clubUser.creator,
    },
  })
}

/** PATCH /api/v1/admin/clubs/credentials/[id] — Atualizar representante */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireSuperAdmin()
  if (!auth) {
    return NextResponse.json({ error: { code: 'AUTH-002', message: 'Acesso negado' } }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const parsed = UpdateClubUserSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VAL_001', message: 'Dados inválidos', fieldErrors: parsed.error.flatten().fieldErrors } },
      { status: 422 }
    )
  }

  const existing = await prisma.clubUser.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Representante não encontrado' } }, { status: 404 })
  }

  // E-mail é @unique: trocar para um já existente lançaria P2002 (500). Checar antes
  // e devolver 409 explícito.
  if (parsed.data.email && parsed.data.email !== existing.email) {
    const dup = await prisma.clubUser.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    })
    if (dup && dup.id !== id) {
      return NextResponse.json(
        { error: { code: 'CLUB_004', message: 'Já existe um representante com este e-mail.' } },
        { status: 409 }
      )
    }
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.email) data.email = parsed.data.email
  if (parsed.data.name) data.name = parsed.data.name
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 12)

  await prisma.clubUser.update({ where: { id }, data })

  return NextResponse.json({ success: true, message: 'Representante atualizado com sucesso.' })
}

/** DELETE /api/v1/admin/clubs/credentials/[id] — Desativar representante (soft delete) */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = await requireSuperAdmin()
  if (!auth) {
    return NextResponse.json({ error: { code: 'AUTH-002', message: 'Acesso negado' } }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.clubUser.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Representante não encontrado' } }, { status: 404 })
  }

  // Soft delete: desativa sem apagar histórico
  await prisma.clubUser.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true, message: 'Representante desativado com sucesso.' })
}
