import { Redis } from '@upstash/redis'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// ─── Redis client (lazy) ───────────────────────────────────────────────────────
// Instanciado apenas em runtime — evita erro de build quando env vars ausentes.
let _redis: Redis | null = null

function getRedis(): Redis | null {
  if (_redis) return _redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  _redis = new Redis({ url, token })
  return _redis
}

const CACHE_TTL_SECONDS = 30

// GET /api/v1/notifications/unread-count
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const userId = auth.user.id
  const cacheKey = `notifications:unread:${userId}`
  const redis = getRedis()

  // ── Cache read ──────────────────────────────────────────────────────────────
  if (redis) {
    try {
      const cached = await redis.get<number>(cacheKey)
      if (cached !== null) {
        return ok({ count: cached })
      }
    } catch {
      // Redis indisponível — prosseguir com DB (fail-open)
    }
  }

  // ── DB query ────────────────────────────────────────────────────────────────
  try {
    const count = await prisma.notification.count({
      where: { userId, read: false },
    })

    // ── Cache write ───────────────────────────────────────────────────────────
    if (redis) {
      try {
        await redis.set(cacheKey, count, { ex: CACHE_TTL_SECONDS })
      } catch {
        // Falha ao gravar cache — responder normalmente
      }
    }

    return ok({ count })
  } catch {
    return errors.server()
  }
}
