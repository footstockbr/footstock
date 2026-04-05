import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth/server'
import { canAccess } from '@/lib/auth/canAccess'
import type { AdminRole } from '@/lib/enums'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ success: false, error: { code: 'AUTH_001', message: 'Não autorizado.' } }, { status: 401 })
  }

  if (!auth.user.adminRole || !canAccess(auth.user.adminRole as AdminRole, 'news:sources')) {
    return NextResponse.json({ success: false, error: { code: 'ADMIN_050', message: 'Acesso negado.' } }, { status: 403 })
  }

  const { id } = await params

  const existing = await prisma.newsSourceWhitelist.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Domínio não encontrado.' } },
      { status: 404 }
    )
  }

  await prisma.newsSourceWhitelist.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
