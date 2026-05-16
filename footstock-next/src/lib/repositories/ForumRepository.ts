// ============================================================================
// FootStock — ForumRepository
// Fonte: module-18/TASK-1/ST002
// ============================================================================

import { prisma } from '@/lib/prisma'
import { PAGE_SIZE } from '@/lib/constants/limits'
import type { PaginatedResult } from '@/types/api'

// ---------------------------------------------------------------------------
// DTOs e Tipos locais
// ---------------------------------------------------------------------------

export interface ForumPostDTO {
  id: string
  content: string
  ticker: string | null
  authorId: string
  authorName: string
  /** null para staff (ADMIN/CLUB_PARTNER) que excepcionalmente postaram no forum. */
  authorPlan: string | null
  likesCount: number
  hasUserLiked: boolean
  isFlagged: boolean
  createdAt: string
}

export type ForumSortOrder = 'recent' | 'popular'

// ---------------------------------------------------------------------------
// ForumRepository
// ---------------------------------------------------------------------------

export class ForumRepository {
  // ─── findAll ─────────────────────────────────────────────────────────────
  async findAll(options: {
    ticker?: string
    sort: ForumSortOrder
    page: number
    userId: string
    isAdmin?: boolean
  }): Promise<PaginatedResult<ForumPostDTO>> {
    const { ticker, sort, page, userId, isAdmin } = options
    const skip = (page - 1) * PAGE_SIZE

    const where: Record<string, unknown> = { isDeleted: false }
    // Posts públicos: apenas PUBLISHED e APPROVED aparecem na listagem
    if (!isAdmin) where.status = { in: ['PUBLISHED', 'APPROVED'] }
    if (ticker) where.ticker = ticker

    const [rawPosts, totalItems] = await Promise.all([
      prisma.globalForumPost.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, planType: true } },
          likes: { where: { userId }, select: { userId: true } },
          _count: { select: { likes: true } },
        },
        orderBy:
          sort === 'popular'
            ? { likes: { _count: 'desc' } }
            : { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.globalForumPost.count({ where }),
    ])

    const items: ForumPostDTO[] = rawPosts.map(p => ({
      id: p.id,
      content: p.content,
      ticker: p.ticker,
      authorId: p.user.id,
      authorName: p.user.name,
      authorPlan: p.user.planType,
      likesCount: p._count.likes,
      hasUserLiked: p.likes.length > 0,
      isFlagged: p.isFlagged,
      createdAt: p.createdAt.toISOString(),
    }))

    const totalPages = Math.ceil(totalItems / PAGE_SIZE)

    return {
      items,
      meta: {
        page,
        pageSize: PAGE_SIZE,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    }
  }

  // ─── create ──────────────────────────────────────────────────────────────
  async create(data: {
    userId: string
    content: string
    ticker?: string
    isFlagged?: boolean
  }) {
    return prisma.globalForumPost.create({
      data: {
        userId: data.userId,
        content: data.content,
        ticker: data.ticker ?? null,
        isFlagged: data.isFlagged ?? false,
      },
      include: {
        user: { select: { id: true, name: true, planType: true } },
        _count: { select: { likes: true } },
      },
    })
  }

  // ─── delete (soft) ───────────────────────────────────────────────────────
  async delete(id: string): Promise<void> {
    await prisma.globalForumPost.update({
      where: { id },
      data: { isDeleted: true },
    })
  }

  // ─── findById ────────────────────────────────────────────────────────────
  async findById(id: string) {
    return prisma.globalForumPost.findFirst({
      where: { id, isDeleted: false },
    })
  }

  // ─── toggleLike ──────────────────────────────────────────────────────────
  async toggleLike(
    postId: string,
    userId: string
  ): Promise<{ liked: boolean; count: number }> {
    const existing = await prisma.forumLike.findUnique({
      where: { postId_userId: { postId, userId } },
    })

    if (existing) {
      await prisma.forumLike.delete({
        where: { postId_userId: { postId, userId } },
      })
    } else {
      await prisma.forumLike.create({ data: { postId, userId } })
    }

    const count = await prisma.forumLike.count({ where: { postId } })
    return { liked: !existing, count }
  }

  // ─── flagPost ────────────────────────────────────────────────────────────
  async flagPost(postId: string): Promise<void> {
    await prisma.globalForumPost.update({
      where: { id: postId },
      data: {
        flagCount: { increment: 1 },
        isFlagged: true,
      },
    })
  }
}

export const forumRepository = new ForumRepository()
