import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth/server'
import { canAccess } from '@/lib/auth/canAccess'
import type { AdminRole } from '@/lib/enums'

const createSchema = z.object({
  url:      z.string().url('URL inválida'),
  name:     z.string().min(2, 'Nome muito curto').max(80),
  isActive: z.boolean().optional().default(true),
})

async function requireAccess() {
  const auth = await getAuthUser()
  if (!auth) {
    return { error: NextResponse.json({ success: false, error: { code: 'AUTH_001', message: 'Não autorizado.' } }, { status: 401 }) }
  }
  if (!auth.user.adminRole || !canAccess(auth.user.adminRole as AdminRole, 'news:sources')) {
    return { error: NextResponse.json({ success: false, error: { code: 'ADMIN_050', message: 'Acesso negado.' } }, { status: 403 }) }
  }
  return { auth }
}

export async function GET() {
  const { error } = await requireAccess()
  if (error) return error

  const feeds = await prisma.rssFeed.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ success: true, data: { feeds } })
}

export async function POST(req: NextRequest) {
  const { error } = await requireAccess()
  if (error) return error

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Dados inválidos.', details: parsed.error.flatten().fieldErrors } },
      { status: 400 }
    )
  }

  const existing = await prisma.rssFeed.findUnique({ where: { url: parsed.data.url } })
  if (existing) {
    return NextResponse.json(
      { success: false, error: { code: 'CONFLICT', message: 'URL já cadastrada.' } },
      { status: 409 }
    )
  }

  const feed = await prisma.rssFeed.create({ data: parsed.data })
  return NextResponse.json({ success: true, data: { feed } }, { status: 201 })
}
