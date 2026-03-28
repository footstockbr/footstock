import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// PATCH /api/v1/notifications/:id/read
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const notification = await prisma.notification.findUnique({ where: { id } })

    if (!notification) return errors.notFound('Notificação não encontrada.')
    if (notification.userId !== auth.user.id) return errors.forbidden()

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    })

    return ok({
      id: updated.id,
      userId: updated.userId,
      type: updated.type,
      title: updated.title,
      body: updated.body,
      read: updated.read,
      metadata: updated.metadata as Record<string, unknown> | null,
      createdAt: updated.createdAt.toISOString(),
    })
  } catch {
    return errors.server()
  }
}
