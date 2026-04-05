import { NextResponse } from 'next/server'
import { getRedisClient } from '@/lib/redis'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { ok, errors } from '@/lib/api'

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

  const redis = getRedisClient()
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
    const [statusRaw, leader, lastTick, startedAt] = await Promise.all([
      redis.get('motor:status'),
      redis.get('motor:leader'),
      redis.get('motor:last_tick'),
      redis.get('motor:started_at'),
    ])

    // SCAN iterativo em vez de KEYS (não bloqueia Redis em produção)
    const haltKeys: string[] = []
    let cursor = '0'
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'motor:halt:*', 'COUNT', 100)
      haltKeys.push(...keys)
      cursor = nextCursor
    } while (cursor !== '0')

    const status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' =
      statusRaw === 'ONLINE' || statusRaw === 'OFFLINE' || statusRaw === 'DEGRADED'
        ? statusRaw
        : 'DEGRADED'

    const haltedTickers = haltKeys.map((k) => k.replace('motor:halt:', ''))

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
