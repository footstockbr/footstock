import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { PostStatus } from '@/types'

// DELETE /api/v1/forum/:id — remover post (MODERADOR+)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return errors.forbidden('Permissão insuficiente. Requer role MODERADOR ou superior.')
  }

  const { id } = await params

  try {
    const post = await prisma.forumPost.findUnique({ where: { id } })

    if (!post) return errors.notFound('Post não encontrado.')

    const removed = await prisma.forumPost.update({
      where: { id },
      data: { status: 'REMOVED' },
    })

    return ok({
      id: removed.id,
      userId: removed.userId,
      content: removed.content,
      ticker: removed.ticker ?? null,
      status: removed.status as PostStatus,
      likes: removed.likes,
      flagged: removed.flagged,
      createdAt: removed.createdAt.toISOString(),
      updatedAt: removed.updatedAt.toISOString(),
    })
  } catch {
    return errors.server()
  }
}
