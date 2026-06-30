import { NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { getRedisClient } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function calcUptime(startedAt: string | null): string | null {
  if (!startedAt) return null
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return `${h}h ${m}min`
}

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// GET /api/v1/admin/motor/status — Monitor+
export async function GET(req: Request = new Request('http://localhost/api/v1/admin/motor/status')) {
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

  const redis = getRedisClient()

  if (!redis) {
    return NextResponse.json({
      success: true,
      data: {
        status: 'DEGRADED' as const,
        leader: 'unknown',
        lastTick: null,
        uptime: null,
        haltedTickers: [],
        globalHalt: { status: 'unknown', halt: null },
        operational: {
          command: null,
          db: { haltAllCount: null, circuitBreakerCount: null, totalHalted: null },
          runtimeConfig: { source: 'unknown', updatedAt: null, updatedBy: null, degraded: true },
        },
      },
    })
  }

  try {
    const url = new URL(req.url)
    const commandId = url.searchParams.get('commandId')
    const commandKey = commandId ? `motor:control:status:${commandId}` : 'motor:control:last-command'

    const [statusRaw, leader, lastTick, startedAt, globalHaltRaw, commandRaw, layersRaw, haltAllCount, circuitBreakerCount, totalHalted] = await Promise.all([
      redis.get('motor:status'),
      redis.get('motor:leader'),
      redis.get('motor:last_tick'),
      redis.get('motor:started_at'),
      redis.get('motor:global-halt'),
      redis.get(commandKey),
      redis.get('motor:layers:config:v1'),
      prisma.asset.count({ where: { isHalted: true, haltReason: 'HALT_ALL' } }),
      prisma.asset.count({ where: { isHalted: true, haltReason: 'CIRCUIT_BREAKER' } }),
      prisma.asset.count({ where: { isHalted: true } }),
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
    const globalHalt = safeJson<{ haltedAt?: string; haltedBy?: string }>(globalHaltRaw)
    const command = safeJson<Record<string, unknown>>(commandRaw)
    const runtime = safeJson<{ updatedAt?: string; updatedBy?: string }>(layersRaw)

    return NextResponse.json({
      success: true,
      data: {
        status: statusValue,
        leader: leader ?? 'unknown',
        lastTick: lastTick ?? null,
        uptime: calcUptime(startedAt ?? null),
        haltedTickers,
        globalHalt: {
          status: globalHalt ? 'halted' : 'running',
          halt: globalHalt
            ? {
                haltedAt: globalHalt.haltedAt ?? null,
                haltedBy: globalHalt.haltedBy ?? null,
              }
            : null,
        },
        operational: {
          command,
          db: {
            haltAllCount,
            circuitBreakerCount,
            totalHalted,
          },
          runtimeConfig: {
            source: runtime ? 'redis' : 'defaults',
            updatedAt: typeof runtime?.updatedAt === 'string' ? runtime.updatedAt : null,
            updatedBy: typeof runtime?.updatedBy === 'string' ? runtime.updatedBy : null,
            degraded: layersRaw !== null && runtime === null,
          },
        },
        // _debug: `raw:${statusRaw}, ioredis:${redis.status}`,
      },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[motor/status] Redis read failed:', errMsg)
    return NextResponse.json({
      success: true,
      data: {
        status: 'DEGRADED',
        leader: 'unknown',
        lastTick: null,
        uptime: null,
        haltedTickers: [],
        globalHalt: { status: 'unknown', halt: null },
        operational: {
          command: null,
          db: { haltAllCount: null, circuitBreakerCount: null, totalHalted: null },
          runtimeConfig: { source: 'unknown', updatedAt: null, updatedBy: null, degraded: true },
        },
        // _debug: `redis_error: ${errMsg}, ioredis:${redis.status}`,
      },
    })
  }
}
