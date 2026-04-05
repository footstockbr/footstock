// GET /api/v1/health/motor — PUBLIC
// Verifica status do motor Railway via chave Redis market:tick:latest.
// HTTP 200 = online, HTTP 503 = offline (compatível com load balancers).

import { NextResponse } from 'next/server'
import { getRedisClient } from '@/lib/redis'

const HEALTH_KEY = 'market:tick:latest'
const STALE_THRESHOLD_SECONDS = 10
const NEXT_CHECK_SECONDS = 30

export async function GET() {
  const redis = getRedisClient()

  if (!redis) {
    return NextResponse.json(
      { status: 'offline', lastTick: null, timeSinceLastTick: null, nextCheck: NEXT_CHECK_SECONDS, error: 'redis_not_configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  try {
    const raw = await redis.get(HEALTH_KEY)

    if (!raw) {
      return NextResponse.json(
        { status: 'offline', lastTick: null, timeSinceLastTick: null, nextCheck: NEXT_CHECK_SECONDS },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const lastTickMs = parseInt(raw, 10)
    if (isNaN(lastTickMs)) {
      return NextResponse.json(
        { status: 'offline', lastTick: null, timeSinceLastTick: null, nextCheck: NEXT_CHECK_SECONDS, error: 'invalid_timestamp' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    const nowMs = Date.now()
    const timeSinceLastTick = (nowMs - lastTickMs) / 1_000

    if (timeSinceLastTick > STALE_THRESHOLD_SECONDS) {
      return NextResponse.json(
        {
          status: 'offline',
          lastTick: new Date(lastTickMs).toISOString(),
          timeSinceLastTick: Math.round(timeSinceLastTick),
          nextCheck: NEXT_CHECK_SECONDS,
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return NextResponse.json(
      {
        status: 'online',
        lastTick: new Date(lastTickMs).toISOString(),
        timeSinceLastTick: Math.round(timeSinceLastTick),
        nextCheck: NEXT_CHECK_SECONDS,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json(
      { error: 'SYS_001', status: 'offline', lastTick: null, timeSinceLastTick: null, nextCheck: NEXT_CHECK_SECONDS },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
