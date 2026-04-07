import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/app/api/middleware'
import type { AuthContext } from '@/app/api/middleware'

const createSchema = z.object({
  url:      z.string().url('URL inválida'),
  name:     z.string().min(2, 'Nome muito curto').max(80),
  isActive: z.boolean().optional().default(true),
})

async function getHandler(_req: NextRequest): Promise<NextResponse> {
  const feeds = await prisma.rssFeed.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ success: true, data: { feeds } })
}

async function postHandler(req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
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

export const GET  = withAdmin('news:sources')(getHandler)
export const POST = withAdmin('news:sources')(postHandler)
