import { getAuthUser } from '@/lib/auth'
import { notificationRepository } from '@/lib/repositories/NotificationRepository'
import { ok, errors } from '@/lib/api'

// PATCH /api/v1/notifications/read-all
export async function PATCH() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    await notificationRepository.markAllAsRead(auth.user.id)
    return ok({ success: true })
  } catch {
    return errors.server()
  }
}
