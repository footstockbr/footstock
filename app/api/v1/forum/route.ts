// ============================================================================
// Foot Stock — GET /api/v1/forum, POST /api/v1/forum
// Forum global: listagem e criação de posts
// Fonte: module-18/TASK-1/ST004
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { forumRepository, type ForumSortOrder } from '@/lib/repositories/ForumRepository'
import { forumService } from '@/lib/services/ForumService'
import { autoModeration } from '@/lib/services/AutoModeration'
import { checkForumRateLimit } from '@/lib/redis/forumRateLimit'

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const CreatePostSchema = z.object({
  content: z
    .string({ required_error: 'Conteúdo é obrigatório.' })
    .min(1, 'Conteúdo não pode ser vazio.')
    .max(280, 'Conteúdo deve ter no máximo 280 caracteres.'),
  ticker: z.string().optional(),
})

// ---------------------------------------------------------------------------
// GET /api/v1/forum
// ---------------------------------------------------------------------------

async function getForumHandler(req: NextRequest, { user }: AuthContext) {
  const { searchParams } = new URL(req.url)
  const sort = (searchParams.get('sort') ?? 'recent') as ForumSortOrder
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const ticker = searchParams.get('ticker') ?? undefined

  const isAdmin = user.adminRole === 'SUPER_ADMIN' || user.adminRole === 'ADMINISTRADOR'

  const result = await forumRepository.findAll({
    ticker,
    sort: sort === 'popular' ? 'popular' : 'recent',
    page,
    userId: user.id,
    isAdmin,
  })

  return NextResponse.json({ success: true, data: result })
}

// ---------------------------------------------------------------------------
// POST /api/v1/forum
// ---------------------------------------------------------------------------

async function createPostHandler(req: NextRequest, { user }: AuthContext) {
  // Rate limit: 30 posts/hora
  const rateLimit = await checkForumRateLimit(user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_001',
          message: 'Muitas requisições em pouco tempo. Aguarde um momento e tente novamente.',
        },
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
      }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Body inválido. Envie um JSON válido.' } },
      { status: 400 }
    )
  }

  const parsed = CreatePostSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: firstIssue?.message ?? 'Dados inválidos.' } },
      { status: 422 }
    )
  }

  const { content, ticker } = parsed.data

  // Validar tamanho ANTES da sanitização (UX — limite visual)
  if (content.length > 280) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORUM_050',
          message: `${content.length}/280 caracteres — limite excedido.`,
        },
      },
      { status: 422 }
    )
  }

  // Processar: sanitizar PII + verificar palavras bloqueadas
  const { sanitized, shouldFlag } = await forumService.processPost(content, user.id)

  // Validar tamanho PÓS-sanitização
  if (sanitized.trim().length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORUM_021',
          message: 'Conteúdo inválido após processamento.',
        },
      },
      { status: 422 }
    )
  }

  if (sanitized.length > 280) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORUM_050',
          message: `${sanitized.length}/280 caracteres — limite excedido.`,
        },
      },
      { status: 422 }
    )
  }

  // Auto-moderação: aplicar regras habilitadas (Rule 2, 3, 4, 5)
  const moderationResult = await autoModeration.aplicarRegras(
    user.id,
    sanitized,
    new Date(user.createdAt)
  )
  if (moderationResult.blocked) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORUM_051',
          message: moderationResult.reason ?? 'Post bloqueado por auto-moderação.',
        },
      },
      { status: 403 }
    )
  }

  const post = await forumRepository.create({
    userId: user.id,
    content: sanitized,
    ticker,
    isFlagged: shouldFlag,
  })

  // Post com palavra bloqueada: salvo mas retorna 422 para informar autor
  if (shouldFlag) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORUM_051',
          message: 'Seu post contém conteúdo não permitido e será revisado pela moderação.',
        },
        data: { id: post.id },
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ success: true, data: post }, { status: 201 })
}

// ---------------------------------------------------------------------------
// Exportações
// ---------------------------------------------------------------------------

export const GET = withAuth(getForumHandler)
export const POST = withAuth(createPostHandler)
