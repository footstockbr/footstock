// ============================================================================
// Foot Stock Motor — Broadcaster
// Publica ticks no canal Redis market:tick.
// TODO: usar process.env.REDIS_URL com TLS quando NODE_ENV === 'production'
// ============================================================================

import type Redis from 'ioredis'
import type { MotorTick } from '../types/motor.types'
import { REDIS_CHANNELS } from '../types/events.types'
import { serializeTick } from '../microstructure/MotorTick'
import { logger } from '../utils/logger'

export class Broadcaster {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async publishTicks(ticks: MotorTick[]): Promise<void> {
    if (ticks.length === 0) return
    const payload = serializeTick(ticks)
    await this.redis.publish(REDIS_CHANNELS.MARKET_TICK, payload)
    logger.debug(`[broadcaster] ${ticks.length} ticks publicados`)
  }
}
