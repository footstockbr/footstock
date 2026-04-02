import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

/** PATCH /api/v1/admin/clubs/credentials/[id] — Atualizar credencial */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (auth.user.adminRole !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { email, password, active } = await request.json()
  const data: Record<string, unknown> = {}
  if (email) data.email = email
  if (active !== undefined) data.active = active
  if (password) data.passwordHash = await bcrypt.hash(password, 12)

  try {
    await (prisma as any).clubCredential?.update({ where: { id }, data })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}

/** DELETE /api/v1/admin/clubs/credentials/[id] — Revogar credencial */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (auth.user.adminRole !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  try {
    await (prisma as any).clubCredential?.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao revogar credencial' }, { status: 500 })
  }
}
