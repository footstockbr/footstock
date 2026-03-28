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
    const post = await prisma.forumPost.findUnique({ where: { id } })

    if (!post || post.status === 'REMOVED') {
      return errors.notFound('Post não encontrado.')
    }

    // TODO: Implementar via /auto-flow execute
    // Adicionar controle de likes únicos por usuário (evitar spam)
    const updated = await prisma.forumPost.update({
      where: { id },
      data: { likes: { increment: 1 } },
    })

    return ok({ likes: updated.likes })
  } catch {
    return errors.server()
  }
}
