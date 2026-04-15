// ============================================================================
// Foot Stock — GET /api/health
// Endpoint de saúde para monitoramento e smoke tests.
// Não requer autenticação — acessível por load balancers e uptime monitors.
// ============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRedisClient } from '@/lib/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const start = Date.now()

  let dbStatus: 'ok' | 'error' = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    dbStatus = 'error'
  }

  let redisStatus: 'ok' | 'error' | 'not_configured' = 'not_configured'
  let redisDetail: string | null = null
  const redis = getRedisClient()
  if (redis) {
    try {
      const pong = await redis.ping()
      if (pong === 'PONG') {
        redisStatus = 'ok'
        // Also check motor heartbeat
        const motorStatus = await redis.get('motor:status')
        redisDetail = `motor:${motorStatus ?? 'null'}, ioredis:${redis.status}`
      } else {
        redisStatus = 'error'
        redisDetail = `ping returned: ${pong}`
      }
    } catch (err) {
      redisStatus = 'error'
      redisDetail = `${err instanceof Error ? err.message : String(err)}, ioredis:${redis.status}`
    }
  } else {
    redisDetail = process.env.REDIS_URL ? `url_present_but_client_null,ioredis_status:n/a` : 'REDIS_URL_missing'
  }

  const latencyMs = Date.now() - start
  const allOk = dbStatus === 'ok' && (redisStatus === 'ok' || redisStatus === 'not_configured')

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.4.0',
      checks: {
        database: dbStatus,
        redis: redisStatus,
        redisDetail,
      },
      latencyMs,
    },
    { status: allOk ? 200 : 503 }
  )
}
