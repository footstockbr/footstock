// ============================================================================
// Foot Stock — PATCH /api/v1/admin/moderation/flagged/[id]
// Ação de moderação sobre post flagrado: approve | reject | ban_user
// Fonte: module-24/TASK-1/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { forumRepository } from '@/lib/repositories/ForumRepository'
import { prisma } from '@/lib/prisma'
import { adminAuditService } from '@/lib/services/shared'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'ban_user']),
})

// ---------------------------------------------------------------------------
// Helper: extrair postId da URL
// ---------------------------------------------------------------------------

function extractPostId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  return segments[segments.length - 1] ?? ''
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/admin/moderation/flagged/[id]
// ---------------------------------------------------------------------------

async function patchHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const postId = extractPostId(req)
  if (!postId) {
    return NextResponse.json({ success: false, error: 'ID inválido.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }

  const parsed = ActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Ação inválida. Use: approve | reject | ban_user' },
      { status: 422 }
    )
  }

  const post = await forumRepository.findById(postId)
  if (!post) {
    return NextResponse.json({ success: false, error: 'Post não encontrado.' }, { status: 404 })
  }

  const { action } = parsed.data

  if (action === 'approve') {
    // Aprovação: remover flag do post
    await prisma.globalForumPost.update({
      where: { id: postId },
      data: { isFlagged: false, flagCount: 0 },
    })
    await adminAuditService.log({
      adminId: user.id,
      action: 'FORUM_POST_APPROVE',
      details: { postId, moderationAction: 'approve', moderatorId: user.id },
    })
    return NextResponse.json({ success: true, data: { id: postId, action: 'approved' } })
  }

  if (action === 'reject') {
    // Rejeição: soft-delete do post
    await forumRepository.delete(postId)
    await adminAuditService.log({
      adminId: user.id,
      action: 'FORUM_POST_REJECT',
      details: { postId, moderationAction: 'reject', moderatorId: user.id },
    })
    return NextResponse.json({ success: true, data: { id: postId, action: 'rejected' } })
  }

  // ban_user: rejeitar post + suspender autor
  await forumRepository.delete(postId)

  await prisma.user.update({
    where: { id: post.userId },
    data: { status: 'SUSPENDED' },
  })

  await adminAuditService.log({
    adminId: user.id,
    action: 'FORUM_POST_BAN_USER',
    details: {
      postId,
      bannedUserId: post.userId,
      moderationAction: 'ban_user',
      moderatorId: user.id,
    },
  })

  return NextResponse.json({
    success: true,
    data: { id: postId, action: 'ban_user', bannedUserId: post.userId },
  })
}

export const PATCH = withAdmin('forum:moderate')(patchHandler)
