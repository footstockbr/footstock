// PATCH /api/v1/notifications/:id/archive
// module-19 — Arquivar notificação (remove do inbox padrão)

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { notificationRepository } from '@/lib/repositories/NotificationRepository'
import { ok, errors } from '@/lib/api'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const updated = await notificationRepository.archive(id, auth.user.id)
    return ok(updated)
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'NOT_FOUND') {
      return NextResponse.json(
        { error: { code: 'SYS_080', message: 'Notificação não encontrada.' } },
        { status: 404 }
      )
    }
    return errors.server()
  }
}
