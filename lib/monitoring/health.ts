// ============================================================================
// Foot Stock — Health Check Utilities
// Checks independentes e paralelos para db, redis e motor.
// Rastreabilidade: INT-110, module-27/TASK-2
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'
import { ALERT_RULES } from '@/lib/monitoring/sentry'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ServiceStatus = 'ok' | 'error'
export type DetailedStatus = 'ok' | 'degraded' | 'error'

export interface HealthCheckResult {
  status: ServiceStatus
  latencyMs?: number
  message?: string
}

export interface DetailedHealthCheckResult extends Omit<HealthCheckResult, 'status'> {
  status: DetailedStatus
}

export interface DetailedHealthReport {
  components: {
    api: DetailedHealthCheckResult
    db: DetailedHealthCheckResult
    redis: DetailedHealthCheckResult
    motor: DetailedHealthCheckResult
  }
  uptime: number
  nodeVersion: string
  timestamp: string
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Deriva DetailedStatus a partir da latência medida e limiares SLO.
 * Fonte de verdade: ALERT_RULES (alinhado com SLO-ALIGNMENT.md quando disponível)
 */
function deriveDetailedStatus(
  latencyMs: number,
  service: 'db' | 'redis' | 'motor'
): DetailedStatus {
  if (latencyMs < 0) return 'error'

  const warnThreshold =
    service === 'redis'
      ? ALERT_RULES.REDIS_LATENCY_WARN_MS
      : service === 'db'
        ? ALERT_RULES.DB_LATENCY_WARN_MS
        : ALERT_RULES.P95_LATENCY_MS

  const errorThreshold =
    service === 'motor'
      ? ALERT_RULES.MOTOR_OFFLINE_SECONDS * 1000
      : ALERT_RULES.P99_LATENCY_MS

  if (latencyMs >= errorThreshold) return 'error'
  if (latencyMs >= warnThreshold) return 'degraded'
  return 'ok'
}

// ---------------------------------------------------------------------------
// Checks individuais
// ---------------------------------------------------------------------------

/** Verifica disponibilidade e latência do banco (Prisma) */
async function checkDatabase(): Promise<HealthCheckResult> {
  const start = performance.now()
  try {
    const timeoutMs = parseInt(process.env.HEALTH_CHECK_DB_TIMEOUT_MS ?? '3000', 10)
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ])
    const latencyMs = Math.round(performance.now() - start)
    return { status: 'ok', latencyMs }
  } catch {
    return { status: 'error', latencyMs: -1 }
  }
}

/** Verifica disponibilidade e latência do Redis */
async function checkRedis(): Promise<HealthCheckResult> {
  const start = performance.now()
  try {
    const timeoutMs = parseInt(process.env.HEALTH_CHECK_REDIS_TIMEOUT_MS ?? '2000', 10)
    await Promise.race([
      redisPublisher.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ])
    const latencyMs = Math.round(performance.now() - start)
    return { status: 'ok', latencyMs }
  } catch {
    return { status: 'error', latencyMs: -1 }
  }
}

/**
 * Verifica disponibilidade do motor via heartbeat Redis.
 * Chave 'motor:heartbeat' com TTL 30s — ausência indica motor offline.
 */
async function checkMotor(): Promise<HealthCheckResult> {
  const start = performance.now()
  try {
    const timeoutMs = parseInt(process.env.HEALTH_CHECK_MOTOR_TIMEOUT_MS ?? '3000', 10)
    const ttl = await Promise.race([
      redisPublisher.ttl('motor:heartbeat'),
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ])
    const latencyMs = Math.round(performance.now() - start)
    // TTL -2 = chave não existe; TTL -1 = sem expiração; TTL > 0 = online
    if (ttl === -2) {
      return { status: 'error', latencyMs: -1, message: 'heartbeat ausente' }
    }
    return { status: 'ok', latencyMs }
  } catch {
    return { status: 'error', latencyMs: -1 }
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Executa os 3 checks em paralelo e retorna resultados básicos */
export async function runAllChecks(): Promise<{
  db: HealthCheckResult
  redis: HealthCheckResult
  motor: HealthCheckResult
}> {
  const [dbResult, redisResult, motorResult] = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkMotor(),
  ])

  return {
    db: dbResult.status === 'fulfilled' ? dbResult.value : { status: 'error', latencyMs: -1 },
    redis:
      redisResult.status === 'fulfilled' ? redisResult.value : { status: 'error', latencyMs: -1 },
    motor:
      motorResult.status === 'fulfilled' ? motorResult.value : { status: 'error', latencyMs: -1 },
  }
}

/** Executa checks com avaliação de DetailedStatus via ALERT_RULES */
export async function runDetailedChecks(): Promise<DetailedHealthReport> {
  const start = performance.now()
  const { db, redis, motor } = await runAllChecks()
  const apiLatencyMs = Math.round(performance.now() - start)

  return {
    components: {
      api: {
        status: 'ok',
        latencyMs: apiLatencyMs,
      },
      db: {
        ...db,
        status: deriveDetailedStatus(db.latencyMs ?? -1, 'db'),
      },
      redis: {
        ...redis,
        status: deriveDetailedStatus(redis.latencyMs ?? -1, 'redis'),
      },
      motor: {
        ...motor,
        status: motor.status === 'error' ? 'error' : deriveDetailedStatus(motor.latencyMs ?? -1, 'motor'),
      },
    },
    uptime: process.uptime(),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  }
}

/** Status geral: 'error' se qualquer componente crítico falhar */
export function getOverallStatus(report: DetailedHealthReport): 'ok' | 'degraded' | 'error' {
  const statuses = Object.values(report.components).map(c => c.status)
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('degraded')) return 'degraded'
  return 'ok'
}
