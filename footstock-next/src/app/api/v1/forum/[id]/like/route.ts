import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// POST /api/v1/forum/:id/like
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const post = await prisma.globalForumPost.findUnique({ where: { id } })

    if (!post || post.isDeleted) {
      return errors.notFound('Post não encontrado.')
    }

    // Controle de likes únicos por usuário via ForumLike (@@unique([postId, userId]))
    const existingLike = await prisma.forumLike.findUnique({
      where: { postId_userId: { postId: id, userId: auth.user.id } },
    })

    if (existingLike) {
      // Já curtiu — retorna contagem atual sem duplicar
      const likeCount = await prisma.forumLike.count({ where: { postId: id } })
      return ok({ likes: likeCount })
    }

    await prisma.forumLike.create({
      data: {
        postId: id,
        userId: auth.user.id,
      },
    })

    const likeCount = await prisma.forumLike.count({ where: { postId: id } })

    return ok({ likes: likeCount })
  } catch {
    return errors.server()
  }
}
