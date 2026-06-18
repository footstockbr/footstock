// ============================================================================
// FootStock Motor — Validação de Variáveis de Ambiente
// Falha rápido (fail-fast) se variáveis obrigatórias estiverem ausentes.
// ============================================================================

import { config } from 'dotenv'
config()

function required(key: string): string {
  const value = process.env[key]
  if (!value) {
    // Em NODE_ENV=test (CI roda `npm test` sem .env e sem REDIS_URL/DATABASE_URL no
    // ambiente), NAO fail-fast no carregamento do modulo: Redis e Prisma sao mockados
    // nos testes, entao um placeholder inerte basta para o modulo carregar. O fail-fast
    // permanece intacto em dev/prod (NODE_ENV != test).
    if (process.env.NODE_ENV === 'test') {
      return `test-placeholder-${key}`
    }
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
  ATTRIBUTION_STRICT_MODE: optional('ATTRIBUTION_STRICT_MODE', 'false') === 'true',
  ORDER_FLOW_SNAPSHOT_ENABLED: optional('ORDER_FLOW_SNAPSHOT_ENABLED', 'true') === 'true',
  ORDER_FLOW_SNAPSHOT_P95_BUDGET_MS: parseInt(optional('ORDER_FLOW_SNAPSHOT_P95_BUDGET_MS', '50'), 10),
  // TODO:REMOVE debug instrumentation (loop 06-17-motor-footstock-correcoes-variacoes / T0.1)
  // Flag de log estruturado por tick. Default OFF: zero overhead em prod.
  // Habilitar para diagnostico/harness: MOTOR_TICK_DEBUG=true.
  MOTOR_TICK_DEBUG: optional('MOTOR_TICK_DEBUG', 'false') === 'true',
  // T1.4 (loop 06-17-motor-footstock-correcoes-variacoes): semantica de execucao de
  // ordens reais. Default-safe 'pre-agent' casa ordens reais no preco PRE-agente (somente
  // dinamica do motor L1-L7 atraves de cap/correlacao/freio, SEM o overlay sintetico dos
  // agentes). 'post-agent' casa no preco publicado (com o impacto do agente). A ratificacao
  // pre vs pos e decisao de operador tecnico + produto/mercado; trocar de lado e uma flag,
  // nao reimplementacao. Qualquer valor != 'post-agent' resolve para 'pre-agent'.
  MOTOR_REAL_ORDER_MATCH_PRICE:
    optional('MOTOR_REAL_ORDER_MATCH_PRICE', 'pre-agent') === 'post-agent' ? 'post-agent' : 'pre-agent',
} as const

// Aviso de segurança: TLS em produção
if (env.NODE_ENV === 'production' && !env.REDIS_TLS) {
  console.warn('[motor:env] WARNING: Conexão Redis sem TLS em ambiente de produção')
}
