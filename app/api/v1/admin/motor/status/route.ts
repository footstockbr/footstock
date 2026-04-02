// ============================================================================
// Foot Stock — GET /api/v1/admin/motor/status
// Status detalhado do motor: estado, líder, último tick, uptime, tickers em halt.
// Requer: motor:read.
// Rastreabilidade: INT-086, TASK-3/ST001
// ============================================================================

import { NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { redisPublisher } from '@/lib/redis'

function calcUptime(startedAt: string | null): string | null {
  if (!startedAt) return null
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return `${h}h ${m}min`
}

export const GET = withAdmin('motor:read')(async () => {
  try {
    const [statusRaw, leader, lastTick, startedAt, haltKeys] = await Promise.all([
      redisPublisher.get('motor:status'),
      redisPublisher.get('motor:leader'),
      redisPublisher.get('motor:last_tick'),
      redisPublisher.get('motor:started_at'),
      redisPublisher.keys('motor:halt:*'),
    ])

    const status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' =
      statusRaw === 'ONLINE' || statusRaw === 'OFFLINE' || statusRaw === 'DEGRADED'
        ? statusRaw
        : 'DEGRADED'

    const haltedTickers = haltKeys.map(k => k.replace('motor:halt:', ''))

    return NextResponse.json({
      data: {
        status,
        leader: leader ?? 'unknown',
        lastTick: lastTick ?? null,
        uptime: calcUptime(startedAt ?? null),
        haltedTickers,
      },
    })
  } catch {
    return NextResponse.json({
      data: {
        status: 'DEGRADED',
        leader: 'unknown',
        lastTick: null,
        uptime: null,
        haltedTickers: [],
      },
    })
  }
})
