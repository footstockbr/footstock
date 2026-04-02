// ============================================================================
// Foot Stock — Admin: Exclusão de conta de usuário (LGPD Art. 18)
// DELETE /api/v1/admin/users/[id]
// Recurso: users:delete — restrito a SUPER_ADMIN
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { deleteAccount } from '@/lib/services/account-deletion'
import type { AuthContext } from '@/app/api/middleware'

async function deleteHandler(
  req: NextRequest,
  ctx: AuthContext,
): Promise<NextResponse> {
  try {
    const match = req.url.match(/\/admin\/users\/([^/]+)$/)
    const targetUserId = match?.[1]

    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_001', message: 'ID de usuário inválido' } },
        { status: 400 },
      )
    }

    // Impedir auto-exclusão via painel admin
    if (targetUserId === ctx.user.id) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_003', message: 'Não é possível excluir a própria conta pelo painel admin' } },
        { status: 403 },
      )
    }

    // Verificar existência do usuário
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true, subscriptions: { where: { status: { in: ['ACTIVE', 'TRIAL', 'CANCELLATION_LOCK'] } }, select: { id: true, status: true } } },
    })

    if (!target) {
      return NextResponse.json(
        { success: false, error: { code: 'USR_001', message: 'Usuário não encontrado' } },
        { status: 404 },
      )
    }

    // Cancelar assinatura ativa antes de deletar
    const activeSub = target.subscriptions[0]
    if (activeSub) {
      await prisma.subscription.update({
        where: { id: activeSub.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })
    }

    // Registrar ação no audit log antes de deletar
    await prisma.adminMarketAction.create({
      data: {
        adminId: ctx.user.id,
        action: 'USER_ACCOUNT_DELETED',
        details: {
          targetUserId,
          targetEmail: target.email,
          targetName: target.name,
          hadActiveSubscription: !!activeSub,
          requestedBy: ctx.user.email,
        },
      },
    })

    // Executar anonimização LGPD
    const result = await deleteAccount(targetUserId, `Excluído por admin ${ctx.user.id} via painel`)

    return NextResponse.json({
      success: true,
      data: {
        message: result.message,
        anonymizedAt: result.anonymizedAt,
        targetUserId,
      },
    })
  } catch (error) {
    console.error('[admin/users/delete]', error)
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_001', message: 'Erro ao excluir conta' } },
      { status: 500 },
    )
  }
}

export const DELETE = withAdmin('users:delete')(deleteHandler)
