import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import type { AuthContext } from '@/app/api/middleware'

const updateAdminSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR']),
})

function getTargetId(req: NextRequest): string | null {
  const match = req.nextUrl.pathname.match(/\/api\/v1\/admin\/admins\/([^/]+)$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

async function patchHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const targetId = getTargetId(req)
  if (!targetId) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'ID invalido' } },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'JSON invalido' } },
      { status: 400 }
    )
  }

  const parsed = updateAdminSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Payload invalido', details: parsed.error.flatten() } },
      { status: 422 }
    )
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, adminRole: true },
  })

  if (!target || !target.adminRole) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_001', message: 'Administrador nao encontrado' } },
      { status: 404 }
    )
  }

  if (target.id === user.id && parsed.data.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_009', message: 'Nao e permitido rebaixar o proprio acesso' } },
      { status: 403 }
    )
  }

  if (target.adminRole === 'SUPER_ADMIN' && parsed.data.role !== 'SUPER_ADMIN') {
    const totalSuperAdmins = await prisma.user.count({ where: { adminRole: 'SUPER_ADMIN' } })
    if (totalSuperAdmins <= 1) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_009', message: 'Nao e permitido remover o ultimo SUPER_ADMIN' } },
        { status: 403 }
      )
    }
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

  return NextResponse.json({ success: true, data: updated })
}

async function deleteHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const targetId = getTargetId(req)
  if (!targetId) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'ID invalido' } },
      { status: 400 }
    )
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, adminRole: true },
  })

  if (!target || !target.adminRole) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_001', message: 'Administrador nao encontrado' } },
      { status: 404 }
    )
  }

  if (target.id === user.id) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_009', message: 'Nao e permitido remover o proprio acesso admin' } },
      { status: 403 }
    )
  }

  if (target.adminRole === 'SUPER_ADMIN') {
    const totalSuperAdmins = await prisma.user.count({ where: { adminRole: 'SUPER_ADMIN' } })
    if (totalSuperAdmins <= 1) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_009', message: 'Nao e permitido remover o ultimo SUPER_ADMIN' } },
        { status: 403 }
      )
    }
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      adminRole: null,
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

  return NextResponse.json({ success: true, data: updated })
}

export const PATCH = withAdmin('users:delete')(patchHandler)
export const DELETE = withAdmin('users:delete')(deleteHandler)
