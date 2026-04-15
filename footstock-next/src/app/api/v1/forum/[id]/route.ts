import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// DELETE /api/v1/forum/:id — remover post (autor OU MODERADOR+)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const post = await prisma.globalForumPost.findUnique({ where: { id } })

    if (!post) return errors.notFound('Post não encontrado.')

    // Autor pode deletar o próprio post; MODERADOR+ pode deletar qualquer post
    const isAuthor = post.userId === auth.user.id
    const isModerator = hasAdminRole(auth.user.adminRole, 'MODERADOR')

    if (!isAuthor && !isModerator) {
      return errors.forbidden('Você só pode excluir seus próprios posts.')
    }

    const removed = await prisma.globalForumPost.update({
      where: { id },
      data: { isDeleted: true },
    })

    return ok({
      id: removed.id,
      userId: removed.userId,
      content: removed.content,
      ticker: removed.ticker ?? null,
      isFlagged: removed.isFlagged,
      flagCount: removed.flagCount,
      isDeleted: removed.isDeleted,
      createdAt: removed.createdAt.toISOString(),
      updatedAt: removed.updatedAt.toISOString(),
    })
  } catch {
    return errors.server()
  }
}
