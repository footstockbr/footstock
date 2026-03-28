// ============================================================================
// Foot Stock Motor — MotorHealthService
// Verifica se o motor está ativo lendo o TTL da chave Redis market:tick:latest.
// O motor publica essa chave a cada tick com TTL=15s (3× o intervalo de 5s).
// ============================================================================

import type Redis from 'ioredis'
import { logger } from '../utils/logger'

export interface MotorHealthStatus {
  status: 'online' | 'offline'
  lastTick: string | null       // ISO timestamp do último tick publicado
  timeSinceLastTick: number | null  // segundos desde o último tick
  isRedisConnected: boolean
}

const HEALTH_KEY = 'market:tick:latest'
const STALE_THRESHOLD_MS = 15_000  // alinhado com TTL=15s do publishTick (EX 15)

let instance: MotorHealthService | null = null

export class MotorHealthService {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async checkHealth(): Promise<MotorHealthStatus> {
    try {
      const raw = await this.redis.get(HEALTH_KEY)

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
      const timeSinceLastTick = (nowMs - lastTickMs) / 1_000  // segundos

      const status: MotorHealthStatus['status'] = timeSinceLastTick > STALE_THRESHOLD_MS / 1_000
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
   * Publica o timestamp do tick atual no Redis com TTL de 15s.
   * Deve ser chamado pelo motor a cada tick.
   */
  async publishTick(): Promise<void> {
    try {
      await this.redis.set(HEALTH_KEY, Date.now().toString(), 'EX', 15)
    } catch (err) {
      logger.error(JSON.stringify({ level: 'error', code: 'SYS_001', service: 'redis', message: 'publishTick failed', error: String(err) }))
    }
  }

  static getInstance(redis: Redis): MotorHealthService {
    if (!instance) {
      instance = new MotorHealthService(redis)
    }
    return instance
  }
}
