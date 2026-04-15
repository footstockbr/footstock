// ============================================================================
// Foot Stock — Motor Online Check Middleware
// Helper reutilizável para verificar se o motor de mercado está online.
//
// Fontes de "offline":
//   1. motor:global-halt presente no Redis → admin pausou manualmente
//   2. market:tick:latest ausente ou stale (>10s) → motor crashou ou está lento
//   3. Redis não configurado → fallback conservador (offline)
//
// Rastreabilidade: T-005 (Modo Degradado / Read-Only)
// ============================================================================

import { getRedisClient } from '@/lib/redis'

const TICK_STALE_THRESHOLD_S = 10
const GLOBAL_HALT_KEY = 'motor:global-halt'
const TICK_KEY = 'market:tick:latest'

export interface MotorOnlineResult {
  online: boolean
  reason?: 'global_halt' | 'stale_tick' | 'redis_unavailable' | 'tick_absent'
}

/**
 * Verifica se o motor de mercado está online.
 * Fail-safe: em caso de erro Redis, assume offline.
 */
export async function isMotorOnline(): Promise<MotorOnlineResult> {
  // Dev mode: motor não roda localmente — assumir online para permitir testes
  if (process.env.NODE_ENV === 'development') {
    return { online: true }
  }

  const redis = getRedisClient()
  if (!redis) {
    return { online: false, reason: 'redis_unavailable' }
  }

  try {
    // 1. Admin pausou manualmente?
    const globalHalt = await redis.exists(GLOBAL_HALT_KEY)
    if (globalHalt) {
      return { online: false, reason: 'global_halt' }
    }

    // 2. Tick recente?
    const raw = await redis.get(TICK_KEY)
    if (!raw) {
      return { online: false, reason: 'tick_absent' }
    }

    const lastTickMs = parseInt(raw, 10)
    if (isNaN(lastTickMs)) {
      return { online: false, reason: 'tick_absent' }
    }

    const ageS = (Date.now() - lastTickMs) / 1_000
    if (ageS > TICK_STALE_THRESHOLD_S) {
      return { online: false, reason: 'stale_tick' }
    }

    return { online: true }
  } catch {
    return { online: false, reason: 'redis_unavailable' }
  }
}
