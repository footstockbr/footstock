// ============================================================================
// Foot Stock — POST /api/v1/forum/:id/like
// Toggle like em post do fórum
// Fonte: module-18/TASK-1/ST006
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { forumRepository } from '@/lib/repositories/ForumRepository'

// ---------------------------------------------------------------------------
// POST /api/v1/forum/:id/like
// ---------------------------------------------------------------------------

async function toggleLikeHandler(
  req: NextRequest,
  { user }: AuthContext,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params

  const post = await forumRepository.findById(postId)
  if (!post) {
    return NextResponse.json(
      { success: false, error: { code: 'FORUM_080', message: 'Post não encontrado.' } },
      { status: 404 }
    )
  }

  const result = await forumRepository.toggleLike(postId, user.id)
  return NextResponse.json({ success: true, data: result })
}

export function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth((r, ctx) => toggleLikeHandler(r, ctx, context))(req)
}
