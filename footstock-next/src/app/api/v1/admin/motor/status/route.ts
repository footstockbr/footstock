import { NextResponse } from 'next/server'
import Redis from 'ioredis'
import { getAuthUser, hasAdminRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Conexão dedicada para motor/status — NÃO usa o singleton de getRedisClient()
// porque a integração Upstash do Vercel injeta REDIS_URL apontando para a
// instância errada, e REDIS_CLOUD_URL pode não estar disponível em todas
// as function instances.
const REDIS_CLOUD_URL = 'redis://default:Ps1JKQrHluqSFkRW85BOAAhqBhG5EeID@redis-10811.crce207.sa-east-1-2.ec2.cloud.redislabs.com:10811'

const _g = globalThis as unknown as { _motorRedis: Redis | undefined }

function getMotorRedis(): Redis {
  if (_g._motorRedis && (_g._motorRedis.status === 'end' || _g._motorRedis.status === 'close')) {
    _g._motorRedis.disconnect()
    _g._motorRedis = undefined
  }
  if (!_g._motorRedis) {
    _g._motorRedis = new Redis(REDIS_CLOUD_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => (times > 10 ? null : Math.min(times * 300, 2_000)),
    })
    _g._motorRedis.on('error', (err: Error) => {
      console.error('[motor/status:redis] error:', err.message)
    })
  }
  return _g._motorRedis
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

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH-010', message: 'Sessão inválida.' } },
      { status: 401 }
    )
  }

  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { success: false, error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  const redis = getMotorRedis()

  try {
    const [statusRaw, leader, lastTick, startedAt] = await Promise.all([
      redis.get('motor:status'),
      redis.get('motor:leader'),
      redis.get('motor:last_tick'),
      redis.get('motor:started_at'),
    ])

    const haltKeys: string[] = []
    let cursor = '0'
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'motor:halt:*', 'COUNT', 100)
      haltKeys.push(...keys)
      cursor = nextCursor
    } while (cursor !== '0')

    const statusValue: 'ONLINE' | 'OFFLINE' | 'DEGRADED' =
      statusRaw === 'ONLINE' || statusRaw === 'OFFLINE' || statusRaw === 'DEGRADED'
        ? statusRaw
        : 'DEGRADED'

    const haltedTickers = haltKeys.map((k) => k.replace('motor:halt:', ''))

    return NextResponse.json({
      data: {
        status: statusValue,
        leader: leader ?? 'unknown',
        lastTick: lastTick ?? null,
        uptime: calcUptime(startedAt ?? null),
        haltedTickers,
        _debug: `raw:${statusRaw}, ioredis:${redis.status}`,
      },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[motor/status] Redis read failed:', errMsg)
    return NextResponse.json({
      data: {
        status: 'DEGRADED',
        leader: 'unknown',
        lastTick: null,
        uptime: null,
        haltedTickers: [],
        _debug: `redis_error: ${errMsg}, ioredis:${redis.status}`,
      },
    })
  }
}
