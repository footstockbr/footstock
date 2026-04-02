import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { ok, errors } from '@/lib/api'

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function calcUptime(startedAt: string | null): string | null {
  if (!startedAt) return null
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return `${h}h ${m}min`
}

// GET /api/v1/admin/motor/status — Monitor+
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
      { status: 403 }
    )
  }

  const redis = getRedis()
  if (!redis) {
    return ok({
      status: 'DEGRADED',
      leader: 'unknown',
      lastTick: null,
      uptime: null,
      haltedTickers: [],
    })
  }

  try {
    const [statusRaw, leader, lastTick, startedAt, haltKeys] = await Promise.all([
      redis.get<string>('motor:status'),
      redis.get<string>('motor:leader'),
      redis.get<string>('motor:last_tick'),
      redis.get<string>('motor:started_at'),
      redis.keys('motor:halt:*'),
    ])

    const status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' =
      statusRaw === 'ONLINE' || statusRaw === 'OFFLINE' || statusRaw === 'DEGRADED'
        ? statusRaw
        : 'DEGRADED'

    const haltedTickers = (haltKeys ?? []).map((k) => k.replace('motor:halt:', ''))

    return ok({
      status,
      leader: leader ?? 'unknown',
      lastTick: lastTick ?? null,
      uptime: calcUptime(startedAt ?? null),
      haltedTickers,
    })
  } catch {
    return ok({
      status: 'DEGRADED',
      leader: 'unknown',
      lastTick: null,
      uptime: null,
      haltedTickers: [],
    })
  }
}
