import { getRedisClient } from '@/lib/redis'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

const CACHE_TTL_SECONDS = 30

// GET /api/v1/notifications/unread-count
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const userId = auth.user.id
  const cacheKey = `notifications:unread:v2:${userId}`
  const redis = getRedisClient()

  // ── Cache read ──────────────────────────────────────────────────────────────
  if (redis) {
    try {
      const cached = await redis.get(cacheKey)
      if (cached !== null) {
        const count = parseInt(cached, 10)
        if (!isNaN(count)) return ok({ count })
        await redis.del(cacheKey) // valor corrompido — remove
      }
    } catch {
      // Redis indisponível — prosseguir com DB (fail-open)
    }
  }

  // ── DB query ────────────────────────────────────────────────────────────────
  try {
    const count = await prisma.notification.count({
      where: { userId, isRead: false, isArchived: false },
    })

    // ── Cache write ───────────────────────────────────────────────────────────
    if (redis) {
      try {
        await redis.set(cacheKey, String(count), 'EX', CACHE_TTL_SECONDS)
      } catch {
        // Falha ao gravar cache — responder normalmente
      }
    }

    return ok({ count })
  } catch {
    return errors.server()
  }
}
