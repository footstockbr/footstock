// Item 24: GET + POST /api/v1/forum/:id/comments — comentarios por post no forum global.
// Sanitiza PII/URLs e REJEITA conteudo flagrado na criacao (sem fila de moderacao); mesmo
// rate-limit/validacao dos posts. So permite ler/comentar em post visivel (PUBLISHED/APPROVED).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, created, errors, error } from '@/lib/api'
import { autoDetectBlockedWords } from '@/lib/moderation'
import { getForumPostRateLimit } from '@/lib/ratelimit'
import { applyRateLimitHeaders, msToResetSeconds, retryAfterFromReset } from '@/middleware/rateLimit'
import { moderationEngine } from '@/lib/services/ModerationEngine'
import { forumRepository } from '@/lib/repositories/ForumRepository'
import type { RateLimitInfo } from '@/middleware/rateLimit'

const CreateCommentSchema = z.object({
  content: z.string({ message: 'Conteúdo é obrigatório.' }),
})

interface CommentRow {
  id: string
  userId: string
  content: string
  createdAt: Date
  user: { name: string }
}

function serializeComment(c: CommentRow) {
  return {
    id: c.id,
    userId: c.userId,
    authorName: c.user.name,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
  }
}

// GET — lista comentarios (mais antigos primeiro), excluindo soft-deleted.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const post = await forumRepository.findPublicById(id)
    if (!post) return errors.notFound('Post não encontrado.')

    const comments = await prisma.forumComment.findMany({
      where: { postId: id, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        userId: true,
        content: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    })

    return ok(comments.map(serializeComment))
  } catch {
    return errors.server()
  }
}

// POST — cria comentario com a mesma moderacao/rate-limit/validacao dos posts.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const post = await forumRepository.findPublicById(id)
    if (!post) return errors.notFound('Post não encontrado.')

    // Rate limit por usuario (reusa o limiter de posts do forum — chave por userId).
    const rl = getForumPostRateLimit()
    const { success: withinLimit, remaining, reset } = await rl.limit(auth.user.id)
    const rlInfo: RateLimitInfo = {
      limit: 10,
      remaining,
      resetTimestampSeconds: msToResetSeconds(reset),
    }
    if (!withinLimit) {
      const res = errors.rateLimit(
        'Você comentou muito rapidamente. Aguarde antes de comentar novamente.',
        new Date(reset).toISOString(),
      )
      applyRateLimitHeaders(res, rlInfo, retryAfterFromReset(reset))
      return res
    }

    const body = await request.json()
    const parsed = CreateCommentSchema.safeParse(body)
    if (!parsed.success) {
      const res = errors.validation()
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    const { content } = parsed.data
    if (content.trim().length === 0) {
      const res = error('FORUM_021', 'Comentário não pode ser vazio.', 422)
      applyRateLimitHeaders(res, rlInfo)
      return res
    }
    if (content.length > 280) {
      const res = error('FORUM_050', `${content.length}/280 caracteres — limite excedido.`, 422)
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // Moderacao: sanitiza PII/URLs e REJEITA conteudo flagrado na criacao (sem fila de
    // moderacao para comentarios). Reusa o mesmo engine + detector de blocked-words dos posts.
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { createdAt: true },
    })
    const userCreatedAt = dbUser?.createdAt ?? new Date()
    const { sanitized, isFlagged: engineFlagged } = await moderationEngine.process(
      content,
      auth.user.id,
      userCreatedAt,
    )

    let wordFlagged = false
    try {
      wordFlagged = await autoDetectBlockedWords(sanitized)
    } catch {
      console.error('[forum/comments] blocked-word check failed — continuing fail-open')
    }

    if (engineFlagged || wordFlagged) {
      const res = error('FORUM_001', 'Comentário rejeitado por conteúdo bloqueado.', 422)
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    const comment = await prisma.forumComment.create({
      data: { postId: id, userId: auth.user.id, content: sanitized },
      select: {
        id: true,
        userId: true,
        content: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    })

    const res = created(serializeComment(comment))
    applyRateLimitHeaders(res, rlInfo)
    return res
  } catch {
    return errors.server()
  }
}
