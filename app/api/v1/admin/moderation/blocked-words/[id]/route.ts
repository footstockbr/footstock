// ============================================================================
// Foot Stock — DELETE /api/v1/admin/moderation/blocked-words/[id]
// Remove palavra bloqueada.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'

const BLOCKED_WORDS_CACHE_KEY = 'blocked_words:list'

function extractId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  return segments[segments.length - 1] ?? ''
}

async function deleteHandler(req: NextRequest): Promise<NextResponse> {
  const id = extractId(req)
  if (!id) {
    return NextResponse.json({ success: false, error: 'ID inválido.' }, { status: 400 })
  }

  try {
    await prisma.blockedWord.delete({ where: { id } })
    try {
      await redisPublisher.del(BLOCKED_WORDS_CACHE_KEY)
    } catch {
      // Ignorar falha de cache.
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Palavra não encontrada.' }, { status: 404 })
  }
}

export const DELETE = withAdmin('forum:moderate')(deleteHandler)

