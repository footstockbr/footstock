// GET /api/v1/health/motor — PUBLIC
// Verifica status do motor Railway via chave Redis market:tick:latest.
// HTTP 200 = online, HTTP 503 = offline (compatível com load balancers).
//
// DEV BYPASS: em NODE_ENV=development, retorna online sem exigir motor Railway.
// O motor é um processo externo que só roda em produção/staging.

import { NextResponse } from 'next/server'
import { getRedisClient } from '@/lib/redis'

const HEALTH_KEY = 'market:tick:latest'
const GLOBAL_HALT_KEY = 'motor:global-halt'
const STALE_THRESHOLD_SECONDS = 10
const NEXT_CHECK_SECONDS = 10  // Reduzido de 30s para 10s — alinhado com polling do frontend

export async function GET() {
  // ── Dev bypass ─────────────────────────────────────────────────────────────
  // O motor Railway não roda localmente. Retorna online para que o banner de
  // "manutenção" não apareça e os formulários de ordem fiquem funcionais em dev.
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.json(
      {
        status: 'online',
        lastTick: new Date().toISOString(),
        timeSinceLastTick: 0,
        nextCheck: NEXT_CHECK_SECONDS,
        mode: 'dev',
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  // ── Production: checar Redis ────────────────────────────────────────────────

  const redis = getRedisClient()

  if (!redis) {
    return NextResponse.json(
      { status: 'offline', lastTick: null, timeSinceLastTick: null, nextCheck: NEXT_CHECK_SECONDS, error: 'redis_not_configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  try {
    // ── Admin global-halt: motor pausado manualmente → modo read-only ────────
    const globalHalt = await redis.exists(GLOBAL_HALT_KEY)
    if (globalHalt) {
      return NextResponse.json(
        { status: 'offline', lastTick: null, timeSinceLastTick: null, nextCheck: NEXT_CHECK_SECONDS, reason: 'global_halt' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      )
    }

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
