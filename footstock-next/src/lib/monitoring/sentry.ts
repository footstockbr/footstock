// ============================================================================
// Foot Stock — Sentry Wrapper Centralizado
// Contextos customizados, helpers de captura e constantes de alerta.
// Rastreabilidade: INT-110, module-27/TASK-1
// ============================================================================

import * as Sentry from '@sentry/nextjs'

// ---------------------------------------------------------------------------
// Constantes de alerta (derivadas de SLO-ALIGNMENT.md quando disponível)
// Fallback para defaults seguros caso o arquivo não exista (module-26 pendente)
// ---------------------------------------------------------------------------

export const ALERT_RULES = {
  /** Taxa de erro: 1% em janela de 5min → fatal */
  ERROR_RATE_THRESHOLD: 0.01,
  /** Latência p95 API Next.js (ms) — SLO Fase 1 */
  P95_LATENCY_MS: parseInt(process.env.HEALTH_CHECK_P95_MS ?? '500', 10),
  /** Latência p99 API Next.js (ms) */
  P99_LATENCY_MS: 2000,
  /** Segundos sem heartbeat motor antes de alertar (heartbeat publicado a cada ~10s, TTL=60s) */
  MOTOR_OFFLINE_SECONDS: 60,
  /** Latência Redis acima deste valor → 'degraded' (ms) */
  REDIS_LATENCY_WARN_MS: 5,
  /** Latência Prisma query acima deste valor → 'degraded' (ms) */
  DB_LATENCY_WARN_MS: 100,
} as const

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type PlanType = 'JOGADOR' | 'CRAQUE' | 'LENDA'
type MotorStatus = 'online' | 'offline' | 'degraded'

// ---------------------------------------------------------------------------
// Contextos de usuário
// ---------------------------------------------------------------------------

/**
 * Define contexto do usuário atual no Sentry.
 * NUNCA envia email (PII) — apenas userId e plano.
 */
export function setUserContext(userId: string, planType: PlanType): void {
  Sentry.setUser({ id: userId })
  Sentry.setTag('plan_type', planType)
}

/** Remove contexto do usuário (chamar no logout) */
export function clearUserContext(): void {
  Sentry.setUser(null)
}

// ---------------------------------------------------------------------------
// Contexto do motor
// ---------------------------------------------------------------------------

/** Atualiza status do motor no contexto Sentry */
export function setMotorContext(status: MotorStatus, sessionType?: string): void {
  Sentry.setTag('motor_status', status)
  if (sessionType) {
    Sentry.setTag('motor_session', sessionType)
  }
}

// ---------------------------------------------------------------------------
// Captura de erros
// ---------------------------------------------------------------------------

/**
 * Wrapper de Sentry.captureException com mapeamento automático de error codes.
 * Mapeia SYS_001/SYS_002/SYS_003/SYS_004 do ERROR-CATALOG com tag error_code.
 * Aceita `tags` no context para propagação direta ao Sentry.
 */
export function captureException(
  error: Error,
  context?: Record<string, unknown> & { tags?: Record<string, string> }
): void {
  const { tags: contextTags, ...extra } = context ?? {}

  // Mapear error codes do ERROR-CATALOG automaticamente
  const errorCode = (error as Error & { code?: string }).code

  Sentry.captureException(error, {
    tags: {
      ...(errorCode ? { error_code: errorCode } : {}),
      ...contextTags,
    },
    extra,
  })
}

/**
 * Captura erro crítico do motor com tag source:motor e level fatal.
 */
export function captureMotorError(
  error: Error,
  motorContext?: Record<string, unknown>
): void {
  Sentry.captureException(error, {
    level: 'fatal',
    tags: { source: 'motor' },
    extra: motorContext,
  })
}

// ---------------------------------------------------------------------------
// Transações de performance
// ---------------------------------------------------------------------------

/**
 * Executa fn dentro de um span Sentry para rastreamento de performance.
 */
export async function withSentryTransaction<T>(
  name: string,
  op: string,
  fn: () => Promise<T>
): Promise<T> {
  return await Sentry.startSpan({ name, op }, async () => {
    return await fn()
  })
}

// ---------------------------------------------------------------------------
// Helpers de notificação (NOTIFICATION-SPEC fallback obrigatório)
// ---------------------------------------------------------------------------

/**
 * Captura falha em notificação crítica com severidade adequada.
 * Referência: NOTIFICATION-SPEC NOTIF-003 (MARGIN_CALL_ALERT), NOTIF-007 (PLAN_CANCEL_ALERT)
 */
export function captureNotificationFailure(
  notifType: 'MARGIN_CALL_ALERT' | 'CIRCUIT_BREAKER' | 'PLAN_CANCEL_ALERT',
  error: Error,
  context?: Record<string, unknown>
): void {
  Sentry.captureException(error, {
    tags: {
      source: 'notification',
      notification_type: notifType,
      severity: notifType === 'MARGIN_CALL_ALERT' ? 'fatal' : 'error',
    },
    extra: context,
  })
}

/**
 * Captura ativação de circuit breaker do motor com contexto do ativo.
 */
export function captureCircuitBreakerAlert(
  assetTicker: string,
  reason: string,
  context?: Record<string, unknown>
): void {
  Sentry.captureMessage(`Circuit breaker ativado: ${assetTicker}`, {
    level: 'error',
    tags: { source: 'motor', alert: 'circuit_breaker', asset: assetTicker },
    extra: { reason, ...context },
  })
}
