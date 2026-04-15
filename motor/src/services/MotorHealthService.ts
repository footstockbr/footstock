// ============================================================================
// Foot Stock Motor — MotorHealthService
// Publica e verifica heartbeat do motor via Redis.
// Delega publicação para heartbeat.ts (fonte de verdade das chaves).
// Chaves publicadas:
//   motor:heartbeat    — consumido por lib/monitoring/health.ts (checkMotor)
//   motor:status       — 'ONLINE' | 'OFFLINE' | 'DEGRADED', consumido por admin/motor/status
//   motor:last_tick    — ISO timestamp do último tick, consumido por admin/motor/status
//   market:tick:latest — Unix ms do último tick (consumido por /api/v1/health/motor)
// ============================================================================

import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import { publishHeartbeat, publishOffline as doPublishOffline, TICK_KEY } from '../heartbeat'

export interface MotorHealthStatus {
  status: 'online' | 'offline'
  lastTick: string | null       // ISO timestamp do último tick publicado
  timeSinceLastTick: number | null  // segundos desde o último tick
  isRedisConnected: boolean
}

const HEARTBEAT_TTL_S = 60

let instance: MotorHealthService | null = null

export class MotorHealthService {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async checkHealth(): Promise<MotorHealthStatus> {
    try {
      const raw = await this.redis.get(TICK_KEY)

      if (!raw) {
        return {
          status: 'offline',
          lastTick: null,
          timeSinceLastTick: null,
          isRedisConnected: true,
        }
      }

      const lastTickMs = parseInt(raw, 10)
      const nowMs = Date.now()
      const timeSinceLastTick = (nowMs - lastTickMs) / 1_000

      const status: MotorHealthStatus['status'] = timeSinceLastTick > HEARTBEAT_TTL_S
        ? 'offline'
        : 'online'

      return {
        status,
        lastTick: new Date(lastTickMs).toISOString(),
        timeSinceLastTick,
        isRedisConnected: true,
      }
    } catch (err) {
      logger.error(JSON.stringify({
        level: 'error',
        code: 'SYS_001',
        service: 'redis',
        message: 'Redis connection error in MotorHealthService',
        error: String(err),
      }))

      return {
        status: 'offline',
        lastTick: null,
        timeSinceLastTick: null,
        isRedisConnected: false,
      }
    }
  }

  /**
   * Publica o heartbeat do motor a cada tick.
   * Deve ser chamado SEMPRE (mesmo quando ticks vazio — sessão CLOSED ou halt global).
   * Delega para heartbeat.ts que é a fonte de verdade das chaves Redis.
   *
   * @param sessionPrisma Sessão canônica (PRE_OPENING, TRADING, CLOSING_CALL, AFTER_MARKET, CLOSED).
   *   Consumida por OrderService._checkMarketSession() no Next.js via Redis key 'market:session'.
   */
  async publishTick(sessionPrisma?: string): Promise<void> {
    await publishHeartbeat(this.redis, sessionPrisma)
  }

  /**
   * Marca o motor como OFFLINE explicitamente (graceful shutdown).
   */
  async publishOffline(): Promise<void> {
    await doPublishOffline(this.redis)
  }

  static getInstance(redis: Redis): MotorHealthService {
    if (!instance) {
      instance = new MotorHealthService(redis)
    }
    return instance
  }
}
