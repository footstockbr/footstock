// ============================================================================
// Foot Stock — DELETE /api/v1/admin/moderation/posts/[id]
// Remove post sinalizado (soft delete) via painel de moderação.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { forumRepository } from '@/lib/repositories/ForumRepository'
import { adminAuditService } from '@/lib/services/shared'

function extractPostId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  return segments[segments.length - 1] ?? ''
}

async function deleteHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const postId = extractPostId(req)
  if (!postId) {
    return NextResponse.json({ success: false, error: 'ID inválido.' }, { status: 400 })
  }

  const post = await forumRepository.findById(postId)
  if (!post) {
    return NextResponse.json({ success: false, error: 'Post não encontrado.' }, { status: 404 })
  }

  await forumRepository.delete(postId)
  await adminAuditService.log({
    adminId: user.id,
    action: 'FORUM_POST_DELETE',
    details: { postId },
  })

  return NextResponse.json({ success: true, data: { id: postId, deleted: true } })
}

export const DELETE = withAdmin('forum:moderate')(deleteHandler)

