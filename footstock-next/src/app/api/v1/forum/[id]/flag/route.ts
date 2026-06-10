// ============================================================================
// FootStock — POST /api/v1/forum/:id/flag
// Denúncia de post — incrementa flagCount, auto-delete com Rule 1
// Fonte: module-18/TASK-5/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { forumRepository } from '@/lib/repositories/ForumRepository'
import { autoModeration } from '@/lib/services/AutoModeration'

// ---------------------------------------------------------------------------
// POST /api/v1/forum/:id/flag
// ---------------------------------------------------------------------------

async function flagPostHandler(
  req: NextRequest,
  { user }: AuthContext,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const post = await forumRepository.findById(id)

  if (!post) {
    return NextResponse.json(
      { success: false, error: { code: 'FORUM_080', message: 'Post não encontrado.' } },
      { status: 404 }
    )
  }

  // Não pode denunciar próprio post
  if (post.userId === user.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORUM_082', message: 'Não é possível denunciar seu próprio post.' } },
      { status: 400 }
    )
  }

  // Incrementar flagCount e marcar como flagged. Usar a contagem autoritativa
  // retornada pelo update atômico (não a leitura velha de `post`) evita decisão
  // de auto-deleção com valor defasado sob denúncias concorrentes.
  const newFlagCount = await forumRepository.flagPost(id)

  // Verificar auto-deletion (Rule 1: 3+ flags)
  const autoDeleted = await autoModeration.verificarFlagsAutoDeletion(id, newFlagCount)

  return NextResponse.json(
    { success: true, data: { flagged: true, autoDeleted } },
    { status: 201 }
  )
}

export function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth((r, ctx) => flagPostHandler(r, ctx, context))(req)
}
