// ============================================================================
// Foot Stock Motor — Heartbeat Publisher
// Publica sinais de "motor vivo" no Redis a cada HEARTBEAT_INTERVAL_MS.
// Chave: market:tick:latest (Unix ms) — TTL=60s.
// Chave legada: motor:heartbeat — consumida por /lib/monitoring/health.ts.
//
// Este módulo é a fonte de verdade para o status do motor no Redis.
// O MarketEngine chama publishTick() via MotorHealthService a cada N ticks.
// Em cenários sem engine (ex: standby), use startStandaloneHeartbeat() abaixo.
//
// Rastreabilidade: T-005 (Modo Degradado / Read-Only)
// ============================================================================

import type Redis from 'ioredis'
import { logger } from './utils/logger'

// Publicado a cada 10s via HEARTBEAT_EVERY ticks (2s/tick × 5 = 10s)
export const HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.MOTOR_HEARTBEAT_INTERVAL_MS ?? '10000',
  10
)
export const HEARTBEAT_TTL_S = 60
export const HEARTBEAT_KEY = 'motor:heartbeat'
export const TICK_KEY = 'market:tick:latest'

/**
 * Publica heartbeat manualmente (usado por MotorHealthService.publishTick).
 * Grava timestamp Unix ms em market:tick:latest e motor:heartbeat com TTL=60s.
 */
export async function publishHeartbeat(redis: Redis, sessionPrisma?: string): Promise<void> {
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()

  try {
    const writes: Promise<unknown>[] = [
      redis.set(TICK_KEY, nowMs.toString(), 'EX', HEARTBEAT_TTL_S),
      redis.set(HEARTBEAT_KEY, nowMs.toString(), 'EX', HEARTBEAT_TTL_S),
      redis.set('motor:status', 'ONLINE', 'EX', HEARTBEAT_TTL_S),
      redis.set('motor:last_tick', nowIso, 'EX', HEARTBEAT_TTL_S),
    ]

    if (sessionPrisma) {
      writes.push(redis.set('market:session', sessionPrisma, 'EX', 15))
    }

    await Promise.all(writes)
  } catch (err) {
    logger.error(JSON.stringify({
      level: 'error',
      code: 'SYS_001',
      service: 'heartbeat',
      message: 'publishHeartbeat failed',
      error: String(err),
    }))
  }
}

/**
 * Remove chaves de heartbeat do Redis (graceful shutdown / motor offline).
 */
export async function publishOffline(redis: Redis): Promise<void> {
  try {
    await Promise.all([
      redis.del(HEARTBEAT_KEY),
      redis.del(TICK_KEY),
      redis.set('motor:status', 'OFFLINE', 'EX', 60),
    ])
  } catch {
    // fail-silent no shutdown
  }
}

/**
 * Inicia heartbeat standalone (sem engine rodando).
 * Útil em instâncias standby ou durante warm-up antes do primeiro tick.
 * Retorna handle do interval para limpeza no shutdown.
 */
export function startStandaloneHeartbeat(redis: Redis): ReturnType<typeof setInterval> {
  logger.info(`[heartbeat] Iniciando heartbeat standalone a cada ${HEARTBEAT_INTERVAL_MS}ms`)
  return setInterval(() => {
    publishHeartbeat(redis).catch(err =>
      logger.error('[heartbeat] Standalone heartbeat failed:', err)
    )
  }, HEARTBEAT_INTERVAL_MS)
}
