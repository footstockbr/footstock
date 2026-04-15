// T-031: GET /api/v1/forum?ticker=FLA3 resolve alias antes de filtrar threads.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { created, list, errors, error, parsePagination, buildPagination } from '@/lib/api'
import { autoDetectBlockedWords } from '@/lib/moderation'
import { getForumPostRateLimit } from '@/lib/ratelimit'
import { forumRepository } from '@/lib/repositories/ForumRepository'
import { applyRateLimitHeaders, msToResetSeconds, retryAfterFromReset } from '@/middleware/rateLimit'
import { moderationEngine } from '@/lib/services/ModerationEngine'
import { AliasService } from '@/services/AliasService'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import type { RateLimitInfo } from '@/middleware/rateLimit'
import type { PostModerationStatus } from '@prisma/client'
import type { UserPlan } from '@/lib/analytics'

// Zod valida apenas tipo e presença do campo; os limites de tamanho (min/max)
// são validados explicitamente abaixo para garantir os códigos FORUM_021 e
// FORUM_050 — sem que o VAL_001 genérico os torne inalcançáveis.
const CreateForumPostSchema = z.object({
  content: z.string({ message: 'Conteúdo é obrigatório.' }),
  ticker: z.string().max(10).optional(),
})

function serializePost(p: {
  id: string
  userId: string
  content: string
  ticker: string | null
  isFlagged: boolean
  flagCount: number
  isDeleted: boolean
  status: PostModerationStatus
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: p.id,
    userId: p.userId,
    content: p.content,
    ticker: p.ticker ?? null,
    isFlagged: p.isFlagged,
    flagCount: p.flagCount,
    isDeleted: p.isDeleted,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

/**
 * Notifica admins com role MODERADOR ou superior sobre post flagrado.
 * Fail-open: erro não bloqueia a criação do post.
 */
async function notifyAdminsAboutFlaggedPost(
  postId: string,
  topicInfo: string
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: {
        adminRole: { in: ['MODERADOR', 'ADMINISTRADOR', 'SUPER_ADMIN', 'EDITOR', 'MONITOR'] },
      },
      select: { id: true },
    })

    if (admins.length === 0) return

    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: 'POST_FLAGGED' as const,
        title: 'Novo post aguardando moderação',
        body: `Um post em "${topicInfo}" foi flagrado e aguarda revisão.`,
        data: { postId, link: `/admin/moderacao?post=${postId}` },
        isRead: false,
        isArchived: false,
      })),
      skipDuplicates: true,
    })
  } catch (err) {
    console.error('[forum] Falha ao notificar admins sobre post flagrado:', err)
  }
}

// GET /api/v1/forum
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const rawTicker = searchParams.get('ticker') ?? undefined
  const sortParam = searchParams.get('sort') ?? 'recentes'
  const sort = sortParam === 'curtidos' ? 'popular' as const : 'recent' as const
  const { page } = parsePagination(searchParams, 20)

  // Resolver alias do ticker (T-031): ?ticker=FLA3 → filtra por URU3
  let ticker = rawTicker?.toUpperCase()
  if (rawTicker) {
    const resolved = await AliasService.resolve(rawTicker)
    if (resolved) ticker = resolved
    // Se não resolver, mantém o ticker original (forumRepository retornará vazio — comportamento correto)
  }

  try {
    const result = await forumRepository.findAll({
      ticker,
      sort,
      page,
      userId: auth.user.id,
    })

    return list(
      result.items,
      buildPagination(result.meta.page, result.meta.pageSize, result.meta.totalItems)
    )
  } catch {
    return errors.server()
  }
}

// POST /api/v1/forum
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    // Rate limit: 10 posts / 1 hora por userId (FDD noticias-comunidade §4.2 — TASK-026)
    // Chave Redis: rl:forum:post:{userId}
    const rl = getForumPostRateLimit()
    const { success: withinLimit, remaining, reset } = await rl.limit(auth.user.id)

    const rlInfo: RateLimitInfo = {
      limit: 10,
      remaining,
      resetTimestampSeconds: msToResetSeconds(reset),
    }

    if (!withinLimit) {
      const retryAfter = retryAfterFromReset(reset)
      const res = errors.rateLimit(
        'Você postou muito rapidamente. Aguarde antes de postar novamente.',
        new Date(reset).toISOString()
      )
      applyRateLimitHeaders(res, rlInfo, retryAfter)
      return res
    }

    const body = await request.json()
    const parsed = CreateForumPostSchema.safeParse(body)

    if (!parsed.success) {
      const res = errors.validation()
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    const { content, ticker: rawPostTicker } = parsed.data

    // Resolver alias do ticker no POST (T-031): ticker: "FLA3" salva como "URU3"
    let ticker: string | undefined
    if (rawPostTicker) {
      const resolved = await AliasService.resolve(rawPostTicker)
      ticker = resolved ?? rawPostTicker.toUpperCase()
    }

    // Validar vazio — FORUM_021
    if (content.trim().length === 0) {
      const res = error('FORUM_021', 'Conteúdo não pode ser vazio.', 422)
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // Validar limite de caracteres — FORUM_050
    if (content.length > 280) {
      const res = error('FORUM_050', `${content.length}/280 caracteres — limite excedido.`, 422)
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // Buscar data de criação da conta para regras de moderação
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { createdAt: true },
    })
    const userCreatedAt = dbUser?.createdAt ?? new Date()

    // Pipeline ModerationEngine (T-028):
    // 1. sanitizePost() — remove PII/URLs com [REDACTED]/[LINK REMOVIDO] (SEMPRE ativa)
    // 2. applyRules()   — aplica regras de conteúdo habilitadas no DB
    const { sanitized, contentRaw, flaggedBy, isFlagged: engineFlagged } =
      await moderationEngine.process(content, auth.user.id, userCreatedAt)

    // Verificação adicional de palavras bloqueadas (fail-open)
    let wordFlagged = false
    try {
      wordFlagged = await autoDetectBlockedWords(sanitized)
    } catch {
      console.error('[forum] blocked-word check failed — continuing fail-open')
    }

    const finalFlagged = engineFlagged || wordFlagged
    const postStatus: PostModerationStatus = finalFlagged ? 'FLAGGED' : 'PUBLISHED'

    const post = await prisma.globalForumPost.create({
      data: {
        userId: auth.user.id,
        content: sanitized,
        // Armazenar original apenas se foi sanitizado (LGPD: prazo 90 dias)
        contentRaw: contentRaw !== sanitized ? contentRaw : null,
        ticker: ticker ?? null,
        isFlagged: finalFlagged, // legado
        flagCount: finalFlagged ? 1 : 0,
        status: postStatus,
        flaggedBy: flaggedBy,
      },
    })

    // EVT-031: forum_post_created — rastreia criacao de post no forum
    mixpanelServer.trackForumPostCreated(auth.user.id, {
      asset_ticker: ticker,
      char_count: sanitized.length,
      plan: (auth.user.planType ?? 'JOGADOR') as UserPlan,
    })

    // Notificar admins se post foi flagrado (fail-open)
    if (finalFlagged) {
      const topicInfo = ticker ? `#${ticker}` : 'Fórum Geral'
      void notifyAdminsAboutFlaggedPost(post.id, topicInfo)
    }

    const res = created({
      ...serializePost(post),
      // Zero Silêncio: feedback ao usuário quando post aguarda moderação
      ...(finalFlagged
        ? { message: 'Seu post está aguardando aprovação de moderação.' }
        : {}),
    })
    applyRateLimitHeaders(res, rlInfo)
    return res
  } catch {
    return errors.server()
  }
}
