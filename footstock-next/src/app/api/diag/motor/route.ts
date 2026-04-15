// TEMPORARY diagnostic endpoint — remove after debugging
import { NextResponse } from 'next/server'
import { getRedisClient } from '@/lib/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const redisUrl = process.env.REDIS_CLOUD_URL || process.env.REDIS_URL || ''
  const hostMatch = redisUrl.match(/@([^/]+)/)
  const redisHost = hostMatch ? hostMatch[1] : 'no_url'
  const envSource = process.env.REDIS_CLOUD_URL ? 'REDIS_CLOUD_URL' : process.env.REDIS_URL ? 'REDIS_URL' : 'none'

  const redis = getRedisClient()
  if (!redis) {
    return NextResponse.json({
      redis_client: 'null',
      env_source: envSource,
      redis_host: redisHost,
      REDIS_CLOUD_URL_set: !!process.env.REDIS_CLOUD_URL,
      REDIS_URL_set: !!process.env.REDIS_URL,
    })
  }

  try {
    const [status, leader, lastTick, startedAt] = await Promise.all([
      redis.get('motor:status'),
      redis.get('motor:leader'),
      redis.get('motor:last_tick'),
      redis.get('motor:started_at'),
    ])

    return NextResponse.json({
      redis_client: 'ok',
      ioredis_status: redis.status,
      env_source: envSource,
      redis_host: redisHost,
      REDIS_CLOUD_URL_set: !!process.env.REDIS_CLOUD_URL,
      REDIS_URL_set: !!process.env.REDIS_URL,
      motor: { status, leader, lastTick, startedAt },
    })
  } catch (err) {
    return NextResponse.json({
      redis_client: 'error',
      ioredis_status: redis.status,
      env_source: envSource,
      redis_host: redisHost,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
