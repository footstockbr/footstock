// ============================================================================
// FootStock — SSoT de leitura/escrita do Circuit Breaker do motor
// ----------------------------------------------------------------------------
// O circuit breaker (halt automatico por variacao extrema) vive DENTRO do blob
// de config das camadas do motor em Redis (`motor:layers:config:v1`), no campo
// `circuitBreaker: { enabled, halt_trigger, halt_duration_s }`. Esta é a MESMA
// fonte lida pelo motor (MotorLayerRuntimeConfig) e pelo editor de Camadas, então
// alterar por aqui mantém tudo coerente (Zero Estados Indefinidos).
//
// `halt_trigger` é fração (0.08 = 8%), clampada em [0.01, 0.50] (1%–50%), igual ao
// schema de /api/v1/admin/motor/layers e ao clamp do motor.
// ============================================================================

import { redisPublisher as redis } from '@/lib/redis'
import { MOTOR_LAYERS_DEFAULTS } from '@/lib/constants/motor-layers'

export const MOTOR_LAYERS_REDIS_KEY = 'motor:layers:config:v1'

export const CB_TRIGGER_MIN = 0.01 // 1%
export const CB_TRIGGER_MAX = 0.5 // 50%
export const CB_DURATION_MIN = 10
export const CB_DURATION_MAX = 3600

export interface CircuitBreakerConfig {
  /** Liga/desliga o halt automatico. Quando false, o motor nunca suspende por variacao. */
  enabled: boolean
  /** Limiar de variacao acumulada que dispara o halt (fração: 0.08 = 8%). */
  halt_trigger: number
  /** Duracao do halt em segundos. */
  halt_duration_s: number
}

const CB_DEFAULTS: CircuitBreakerConfig = {
  enabled: MOTOR_LAYERS_DEFAULTS.circuitBreaker.enabled,
  halt_trigger: MOTOR_LAYERS_DEFAULTS.circuitBreaker.halt_trigger,
  halt_duration_s: MOTOR_LAYERS_DEFAULTS.circuitBreaker.halt_duration_s,
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

async function readBlob(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await redis.get(MOTOR_LAYERS_REDIS_KEY)
    if (!raw) return null
    const json = JSON.parse(raw)
    return typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Normaliza um objeto circuitBreaker cru (parcial/legado) para o shape canonico. */
function normalize(cb: Partial<CircuitBreakerConfig> | undefined | null): CircuitBreakerConfig {
  return {
    enabled: typeof cb?.enabled === 'boolean' ? cb.enabled : CB_DEFAULTS.enabled,
    halt_trigger: isFiniteNumber(cb?.halt_trigger)
      ? clamp(cb!.halt_trigger, CB_TRIGGER_MIN, CB_TRIGGER_MAX)
      : CB_DEFAULTS.halt_trigger,
    halt_duration_s: isFiniteNumber(cb?.halt_duration_s)
      ? Math.floor(clamp(cb!.halt_duration_s, CB_DURATION_MIN, CB_DURATION_MAX))
      : CB_DEFAULTS.halt_duration_s,
  }
}

/** Lê a config atual do circuit breaker do SSoT (defaults quando ausente/malformado). */
export async function readCircuitBreakerConfig(): Promise<{
  config: CircuitBreakerConfig
  source: 'redis' | 'defaults'
  updatedAt: string | null
  updatedBy: string | null
}> {
  const blob = await readBlob()
  if (!blob) {
    return { config: { ...CB_DEFAULTS }, source: 'defaults', updatedAt: null, updatedBy: null }
  }
  return {
    config: normalize(blob.circuitBreaker as Partial<CircuitBreakerConfig> | undefined),
    source: 'redis',
    updatedAt: (blob.updatedAt as string | null) ?? null,
    updatedBy: (blob.updatedBy as string | null) ?? null,
  }
}

/**
 * Atualiza SÓ o subtree circuitBreaker do blob, preservando todas as demais camadas
 * (read-merge-write). Mantém a SSoT coerente para motor + editor de Camadas.
 * Campos do `patch` ausentes mantêm o valor atual.
 */
export async function writeCircuitBreakerConfig(
  patch: Partial<CircuitBreakerConfig>,
  userId: string
): Promise<CircuitBreakerConfig> {
  const blob = (await readBlob()) ?? { ...MOTOR_LAYERS_DEFAULTS }
  const current = normalize(blob.circuitBreaker as Partial<CircuitBreakerConfig> | undefined)

  const next = normalize({
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    halt_trigger: isFiniteNumber(patch.halt_trigger) ? patch.halt_trigger : current.halt_trigger,
    halt_duration_s: isFiniteNumber(patch.halt_duration_s) ? patch.halt_duration_s : current.halt_duration_s,
  })

  const merged = {
    ...MOTOR_LAYERS_DEFAULTS, // garante shape completo se o blob era parcial
    ...blob, // preserva customizacoes existentes das demais camadas
    circuitBreaker: next,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  }

  await redis.set(MOTOR_LAYERS_REDIS_KEY, JSON.stringify(merged))
  return next
}
