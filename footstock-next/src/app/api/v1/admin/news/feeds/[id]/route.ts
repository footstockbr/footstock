import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth/server'
import { canAccess } from '@/lib/auth/canAccess'
import type { AdminRole } from '@/lib/enums'

const updateSchema = z.object({
  url:      z.string().url('URL inválida').optional(),
  name:     z.string().min(2).max(80).optional(),
  isActive: z.boolean().optional(),
})

async function requireFeedAccess(id: string) {
  const auth = await getAuthUser()
  if (!auth) {
    return { error: NextResponse.json({ success: false, error: { code: 'AUTH-001', message: 'Não autorizado.' } }, { status: 401 }) }
  }
  if (!auth.user.adminRole || !canAccess(auth.user.adminRole as AdminRole, 'news:sources')) {
    return { error: NextResponse.json({ success: false, error: { code: 'ADMIN_050', message: 'Acesso negado.' } }, { status: 403 }) }
  }
  const feed = await prisma.rssFeed.findUnique({ where: { id } })
  if (!feed) {
    return { error: NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Feed não encontrado.' } }, { status: 404 }) }
  }
  return { feed }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { feed, error } = await requireFeedAccess(id)
  if (error || !feed) return error!

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Dados inválidos.', details: parsed.error.flatten().fieldErrors } },
      { status: 400 }
    )
  }

  if (parsed.data.url && parsed.data.url !== feed.url) {
    const urlConflict = await prisma.rssFeed.findUnique({ where: { url: parsed.data.url } })
    if (urlConflict) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'URL já cadastrada em outro feed.' } },
        { status: 409 }
      )
    }
  }

  const updated = await prisma.rssFeed.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ success: true, data: { feed: updated } })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { error } = await requireFeedAccess(id)
  if (error) return error

  await prisma.rssFeed.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
