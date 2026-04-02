// ============================================================================
// Foot Stock — DELETE /api/v1/forum/:id
// Deletar post (soft delete) — próprio autor ou admin
// Fonte: module-18/TASK-1/ST005
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { forumRepository } from '@/lib/repositories/ForumRepository'
import type { AdminRole } from '@/lib/enums'
import { canAccess } from '@/lib/auth'

// ---------------------------------------------------------------------------
// DELETE /api/v1/forum/:id
// ---------------------------------------------------------------------------

async function deletePostHandler(
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

  const isAdmin =
    user.adminRole !== null &&
    user.adminRole !== undefined &&
    canAccess(user.adminRole as AdminRole, 'forum:moderate')

  const isOwner = post.userId === user.id

  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'AUTH_005', message: 'Sem permissão para deletar este post.' },
      },
      { status: 403 }
    )
  }

  await forumRepository.delete(id)
  return NextResponse.json({ success: true, data: { id, deleted: true } })
}

export function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth((r, ctx) => deletePostHandler(r, ctx, context))(req)
}
