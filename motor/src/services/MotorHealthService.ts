// ============================================================================
// Foot Stock Motor — MotorHealthService
// Publica e verifica heartbeat do motor via Redis.
// Chaves publicadas a cada tick (TTL=30s):
//   motor:heartbeat    — consumido por lib/monitoring/health.ts (checkMotor)
//   motor:status       — 'ONLINE' | 'OFFLINE' | 'DEGRADED', consumido por admin/motor/status
//   motor:last_tick    — ISO timestamp do último tick, consumido por admin/motor/status
//   market:tick:latest — Unix ms do último tick (compat. legado)
// ============================================================================

import type Redis from 'ioredis'
import { logger } from '../utils/logger'

export interface MotorHealthStatus {
  status: 'online' | 'offline'
  lastTick: string | null       // ISO timestamp do último tick publicado
  timeSinceLastTick: number | null  // segundos desde o último tick
  isRedisConnected: boolean
}

// TTL das chaves de heartbeat: 30s (15× o intervalo de 2s — margem ampla)
const HEARTBEAT_TTL_S = 30
const HEALTH_KEY_LEGACY = 'market:tick:latest'  // compat. legado
const HEARTBEAT_KEY = 'motor:heartbeat'          // consumido por health.ts
const STATUS_KEY = 'motor:status'                // consumido por admin status
const LAST_TICK_KEY = 'motor:last_tick'          // consumido por admin status

let instance: MotorHealthService | null = null

export class MotorHealthService {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async checkHealth(): Promise<MotorHealthStatus> {
    try {
      const raw = await this.redis.get(HEALTH_KEY_LEGACY)

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
   * Deve ser chamado SEMPRE (mesmo quando ticks vazio — sessão FECHADO ou halt global).
   * Escreve 4 chaves Redis com TTL=30s para consumidores distintos.
   */
  async publishTick(): Promise<void> {
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()

    try {
      await Promise.all([
        // Chave consumida por lib/monitoring/health.ts → checkMotor()
        this.redis.set(HEARTBEAT_KEY, nowMs.toString(), 'EX', HEARTBEAT_TTL_S),
        // Chave consumida por app/api/v1/admin/motor/status
        this.redis.set(STATUS_KEY, 'ONLINE', 'EX', HEARTBEAT_TTL_S),
        // Chave consumida por app/api/v1/admin/motor/status (lastTick)
        this.redis.set(LAST_TICK_KEY, nowIso, 'EX', HEARTBEAT_TTL_S),
        // Chave legada (compat.)
        this.redis.set(HEALTH_KEY_LEGACY, nowMs.toString(), 'EX', HEARTBEAT_TTL_S),
      ])
    } catch (err) {
      logger.error(JSON.stringify({
        level: 'error',
        code: 'SYS_001',
        service: 'redis',
        message: 'publishTick failed',
        error: String(err),
      }))
    }
  }

  /**
   * Marca o motor como OFFLINE explicitamente (graceful shutdown).
   */
  async publishOffline(): Promise<void> {
    try {
      await Promise.all([
        this.redis.del(HEARTBEAT_KEY),
        this.redis.set(STATUS_KEY, 'OFFLINE', 'EX', 60),
      ])
    } catch {
      // fail-silent no shutdown
    }
  }

  static getInstance(redis: Redis): MotorHealthService {
    if (!instance) {
      instance = new MotorHealthService(redis)
    }
    return instance
  }
}
