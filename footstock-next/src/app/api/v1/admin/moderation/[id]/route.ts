import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { recordModerationAction } from '@/lib/moderation'
import type { User, AdminRole } from '@/types'

function getDevAuthFromCookie(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return null
  const adminRole = request.cookies.get('fs-admin-role')?.value
  if (!adminRole) return null
  const validRoles = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MODERADOR', 'EDITOR', 'MONITOR', 'CLUB_PARTNER']
  if (!validRoles.includes(adminRole)) return null
  const dummyUser: User = {
    id: 'dev-user',
    email: 'dev@foot-stock.test',
    name: 'Dev User',
    phone: null,
    birthDate: '',
    favoriteClub: '',
    favoriteClubDisplayName: null,
    userType: 'NORMAL',
    investorProfile: 'INICIANTE',
    planType: 'JOGADOR',
    fsBalance: 0,
    marginBlocked: 0,
    tourCompleted: false,
    ageVerificationPending: false,
    adminRole: adminRole as AdminRole,
    version: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return { user: dummyUser, supabaseId: 'dev-user' }
}

// Aprovar post (remover flag)
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  const action = request.nextUrl.searchParams.get('action') || 'approve'

  try {
    // Verificar existência do post
    const post = await prisma.globalForumPost.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true, isDeleted: true },
    })
    if (!post) {
      return NextResponse.json(
        { error: { code: 'MODERATION-001', message: 'Post não encontrado' } },
        { status: 404 }
      )
    }

    if (action === 'approve') {
      await prisma.globalForumPost.update({
        where: { id: params.id },
        data: { isFlagged: false, flagCount: 0, status: 'APPROVED' },
      })
      await recordModerationAction(params.id, auth.user.id, 'APPROVED')
      return ok({ message: 'Post aprovado', postId: params.id })

    } else if (action === 'remove') {
      await prisma.globalForumPost.update({
        where: { id: params.id },
        data: { isDeleted: true, status: 'REJECTED' },
      })
      await recordModerationAction(params.id, auth.user.id, 'REMOVED')
      return ok({ message: 'Post removido', postId: params.id })

    } else if (action === 'ban_user') {
      // ban_user: rejeita o post E suspende o autor — exige role ADMINISTRADOR+
      if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
        return NextResponse.json(
          { error: { code: 'ADMIN-050', message: 'Banir usuário requer role ADMINISTRADOR ou SUPER_ADMIN.' } },
          { status: 403 }
        )
      }

      // 1. Remover o post
      await prisma.globalForumPost.update({
        where: { id: params.id },
        data: { isDeleted: true, isFlagged: true },
      })
      await recordModerationAction(params.id, auth.user.id, 'REMOVED', 'Banimento de usuário')

      // 2. Suspender o autor (chamar endpoint interno de suspensão)
      const body = await request.json().catch(() => ({}))
      const suspendReason = (body as { reason?: string }).reason || 'Violação das regras de moderação'

      await prisma.user.update({
        where: { id: post.userId },
        data: { suspendedAt: new Date(), suspensionReason: suspendReason },
      })

      // 3. Registrar audit trail
      console.log(
        `[moderation] BAN_USER postId=${params.id} authorId=${post.userId} by=${auth.user.id} reason="${suspendReason}"`
      )

      return ok({
        message: 'Post removido e usuário banido',
        postId: params.id,
        bannedUserId: post.userId,
      })
    }

    return errors.validation('Ação inválida. Use: approve | remove | ban_user')
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'MODERATION-001', message: 'Post não encontrado' } },
        { status: 404 }
      )
    }
    console.error('[moderation] Error:', error)
    return errors.server()
  }
}

// PATCH — compatibilidade com ModerationModule.tsx que usa PATCH + body JSON
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const action = (body as { action?: string }).action ?? ''

  try {
    const post = await prisma.globalForumPost.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true },
    })
    if (!post) {
      return NextResponse.json(
        { error: { code: 'MODERATION-001', message: 'Post não encontrado' } },
        { status: 404 }
      )
    }

    if (action === 'APPROVED') {
      await prisma.globalForumPost.update({
        where: { id: params.id },
        data: { isFlagged: false, flagCount: 0, status: 'APPROVED' },
      })
      await recordModerationAction(params.id, auth.user.id, 'APPROVED')
      return ok({ message: 'Post aprovado', postId: params.id })
    }

    if (action === 'REMOVED') {
      await prisma.globalForumPost.update({
        where: { id: params.id },
        data: { isDeleted: true, status: 'REJECTED' },
      })
      await recordModerationAction(params.id, auth.user.id, 'REMOVED')
      // Notificar autor sobre rejeição
      try {
        await prisma.notification.create({
          data: {
            userId: post.userId,
            type: 'POST_REJECTED',
            title: 'Post não aprovado',
            body: 'Seu post foi analisado e não foi aprovado pela equipe de moderação.',
            isRead: false,
            isArchived: false,
          },
        })
      } catch {
        // Notificação não crítica
      }
      return ok({ message: 'Post rejeitado', postId: params.id })
    }

    return errors.validation('Ação inválida. Use: APPROVED | REMOVED')
  } catch (err) {
    console.error('[moderation] PATCH error:', err)
    return errors.server()
  }
}

// Deletar post permanentemente (hard delete) — apenas ADMINISTRADOR/SUPER_ADMIN
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Apenas ADMINISTRADOR ou SUPER_ADMIN podem deletar permanentemente.' } },
      { status: 403 }
    )
  }

  try {
    // Verify the post exists and is already soft-deleted
    const post = await prisma.globalForumPost.findUnique({
      where: { id: params.id },
      select: { id: true, isDeleted: true, content: true, userId: true },
    })

    if (!post) {
      return NextResponse.json(
        { error: { code: 'MODERATION-001', message: 'Post nao encontrado' } },
        { status: 404 }
      )
    }

    if (!post.isDeleted) {
      return NextResponse.json(
        { error: { code: 'MODERATION-002', message: 'Post precisa estar removido (soft-delete) antes de ser deletado permanentemente.' } },
        { status: 400 }
      )
    }

    // Hard delete — cascades will handle likes and moderation actions
    await prisma.globalForumPost.delete({
      where: { id: params.id },
    })

    // Log audit server-side (cascade destroys ModerationAction FK rows,
    // so we log here instead of recording via recordModerationAction)
    console.log(
      `[moderation] PERMANENTLY_DELETED postId=${params.id} userId=${post.userId} by=${auth.user.id} content="${post.content.substring(0, 80)}"`
    )

    return ok({ message: 'Post deletado permanentemente', postId: params.id })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'MODERATION-001', message: 'Post nao encontrado' } },
        { status: 404 }
      )
    }
    console.error('[moderation] Error permanent delete:', error)
    return errors.server()
  }
}
