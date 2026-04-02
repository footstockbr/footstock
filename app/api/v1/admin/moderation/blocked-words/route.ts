// ============================================================================
// Foot Stock — /api/v1/admin/moderation/blocked-words
// Lista e cadastro de palavras bloqueadas da comunidade.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'

const createSchema = z.object({
  word: z.string().min(2).max(64),
})

const BLOCKED_WORDS_CACHE_KEY = 'blocked_words:list'

async function getHandler(): Promise<NextResponse> {
  const words = await prisma.blockedWord.findMany({
    orderBy: { word: 'asc' },
    select: { id: true, word: true, createdAt: true },
  })
  return NextResponse.json({ success: true, data: words })
}

async function postHandler(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Palavra inválida.' }, { status: 422 })
  }

  const normalized = parsed.data.word.trim().toLowerCase()

  try {
    const created = await prisma.blockedWord.create({
      data: { word: normalized },
      select: { id: true, word: true, createdAt: true },
    })
    try {
      await redisPublisher.del(BLOCKED_WORDS_CACHE_KEY)
    } catch {
      // Ignorar falha de cache.
    }
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Palavra já existe ou não pôde ser criada.' },
      { status: 409 }
    )
  }
}

export const GET = withAdmin('forum:moderate')(getHandler)
export const POST = withAdmin('forum:moderate')(postHandler)

