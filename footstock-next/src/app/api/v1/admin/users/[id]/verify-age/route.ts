// T-023: Admin override — marcar usuário como verificado manualmente
// POST /api/v1/admin/users/:id/verify-age
// Requer role ADMINISTRADOR+

import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { logAdminAction } from '@/lib/middleware/admin-audit'
import { sendNotification } from '@/lib/services/NotificationService'
import { NOTIFICATION_TYPE } from '@/lib/enums'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  const { id } = await params

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, cpfHash: true, ageVerificationPending: true },
    })

    if (!user) return errors.notFound('Usuário não encontrado.')

    if (!user.ageVerificationPending) {
      return ok({ message: 'Verificação de maioridade já concluída para este usuário.' })
    }

    // Registrar verificação manual na tabela age_verifications
    await prisma.ageVerification.create({
      data: {
        userId: user.id,
        cpfHash: user.cpfHash,
        isAdult: true,
        method: 'ADMIN_OVERRIDE',
        verifiedAt: new Date(),
      },
    })

    // Atualizar flag do usuário
    await prisma.user.update({
      where: { id },
      data: { ageVerificationPending: false },
    })

    // Audit trail
    await logAdminAction({
      adminId: auth.user.id,
      action: 'VERIFY_AGE_OVERRIDE',
      details: { targetUserId: user.id, method: 'ADMIN_OVERRIDE' },
    })

    // Notificar usuário
    sendNotification(
      user.id,
      NOTIFICATION_TYPE.AGE_VERIFICATION_COMPLETED,
      {
        title: 'Verificação concluída',
        body: 'Sua verificação de maioridade foi concluída com sucesso. Todas as funcionalidades estão liberadas.',
      }
    ).catch((err: unknown) => console.error('[admin/verify-age] Falha ao notificar:', err))

    return ok({
      message: 'Verificação de maioridade concluída manualmente.',
      userId: user.id,
      method: 'ADMIN_OVERRIDE',
    })
  } catch {
    return errors.server()
  }
}
