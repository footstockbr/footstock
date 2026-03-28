import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// GET /api/v1/notifications/unread-count
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const count = await prisma.notification.count({
      where: { userId: auth.user.id, read: false },
    })

    return ok({ count })
  } catch {
    return errors.server()
  }
}
