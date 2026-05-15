// ============================================================================
// Foot Stock Motor — Validação de Variáveis de Ambiente
// Falha rápido (fail-fast) se variáveis obrigatórias estiverem ausentes.
// ============================================================================

import { config } from 'dotenv'
config()

function required(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `[env] Variável obrigatória ausente: ${key}. Consulte motor/.env.example.`
    )
  }
  return value
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const env = {
  REDIS_URL: required('REDIS_URL'),
  DATABASE_URL: required('DATABASE_URL'),
  MOTOR_TICK_INTERVAL_MS: parseInt(optional('MOTOR_TICK_INTERVAL_MS', '10000'), 10),
  MOTOR_LEADER_TTL_S: parseInt(optional('MOTOR_LEADER_TTL_S', '30'), 10),
  MOTOR_LEADER_HEARTBEAT_S: parseInt(optional('MOTOR_LEADER_HEARTBEAT_S', '10'), 10),
  MOTOR_CIRCUIT_BREAKER_THRESHOLD: parseFloat(
    optional('MOTOR_CIRCUIT_BREAKER_THRESHOLD', '0.08')
  ),
  MOTOR_CIRCUIT_BREAKER_HALT_DURATION_S: parseInt(
    optional('MOTOR_CIRCUIT_BREAKER_HALT_DURATION_S', '300'),
    10
  ),
  NODE_ENV: optional('NODE_ENV', 'development'),
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),
  MOTOR_ADMIN_SECRET: optional('MOTOR_ADMIN_SECRET', ''),
  REDIS_TLS: optional('REDIS_TLS', 'false') === 'true',
  // Task 008 (loop 05-14-foot-stock-motor-action-plan): contagens reduzidas ~50%.
  // Default OFF em prod ate validacao A/B em staging por 48h.
  // Habilitar em staging: MOTOR_AGENT_COUNTS_V2=true.
  MOTOR_AGENT_COUNTS_V2: optional('MOTOR_AGENT_COUNTS_V2', 'false') === 'true',
} as const

// Aviso de segurança: TLS em produção
if (env.NODE_ENV === 'production' && !env.REDIS_TLS) {
  console.warn('[motor:env] WARNING: Conexão Redis sem TLS em ambiente de produção')
}
