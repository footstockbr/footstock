import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import type { AuthContext } from '@/app/api/middleware'
import { ADMIN_ROLE } from '@/lib/enums'

const createAdminSchema = z.object({
  email: z.string().email('E-mail invalido'),
  role: z.enum(['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR']),
})

async function getHandler(): Promise<NextResponse> {
  const admins = await prisma.user.findMany({
    where: { adminRole: { not: null } },
    select: {
      id: true,
      name: true,
      email: true,
      adminRole: true,
      status: true,
      planType: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ adminRole: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ success: true, data: admins })
}

async function postHandler(req: NextRequest, ctx: AuthContext): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'JSON invalido' } },
      { status: 400 }
    )
  }

  const parsed = createAdminSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Payload invalido', details: parsed.error.flatten() } },
      { status: 422 }
    )
  }

  const email = parsed.data.email.trim().toLowerCase()

  const target = await prisma.user.findUnique({
    where: { email },
    select: { id: true, adminRole: true, name: true, email: true, status: true, planType: true },
  })

  if (!target) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_001', message: 'Usuario nao encontrado' } },
      { status: 404 }
    )
  }

  if (target.adminRole === parsed.data.role) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_006', message: 'Usuario ja possui esta role admin' } },
      { status: 409 }
    )
  }

  // Guard anti-self-promotion: SUPER_ADMIN não pode promover a si mesmo
  if (ctx.user.id === target.id && parsed.data.role === ADMIN_ROLE.SUPER_ADMIN) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_007', message: 'Nao e permitido auto-promover para SUPER_ADMIN' } },
      { status: 403 }
    )
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      adminRole: parsed.data.role,
      planType: 'JOGADOR',
    },
    select: {
      id: true,
      name: true,
      email: true,
      adminRole: true,
      status: true,
      planType: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ success: true, data: updated }, { status: 201 })
}

export const GET = withAdmin('users:read')(getHandler)
export const POST = withAdmin('users:delete')(postHandler)
