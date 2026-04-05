import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/app/api/middleware'
import type { AuthContext } from '@/app/api/middleware'

const addSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, 'Domínio inválido (ex: globoesporte.com)'),
})

async function getHandler(_req: NextRequest): Promise<NextResponse> {
  const sources = await prisma.newsSourceWhitelist.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ success: true, data: { sources } })
}

async function postHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const body = await req.json()
  const parsed = addSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Domínio inválido.', details: parsed.error.flatten().fieldErrors } },
      { status: 400 }
    )
  }

  const existing = await prisma.newsSourceWhitelist.findUnique({
    where: { domain: parsed.data.domain },
  })

  if (existing) {
    return NextResponse.json(
      { success: false, error: { code: 'CONFLICT', message: 'Domínio já está na whitelist.' } },
      { status: 409 }
    )
  }

  const source = await prisma.newsSourceWhitelist.create({
    data: { domain: parsed.data.domain, addedBy: user.id },
  })

  return NextResponse.json({ success: true, data: { source } }, { status: 201 })
}

export const GET = withAdmin('news:sources')(getHandler)
export const POST = withAdmin('news:sources')(postHandler)
