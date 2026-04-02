/**
 * Cenário 06 — Criação de Ordem (fluxo crítico de negócios)
 * Endpoint: POST /api/v1/orders
 * Auth: Bearer JWT
 * Tipo: crud_write
 * SLO: p95 < 800ms, p99 < 2000ms
 *
 * Criticidade: Máxima — core do produto; envolve lock otimista no banco e
 *              validação de saldo. Motor executa ordens PENDING a cada 2s.
 *
 * Erros esperados (ERROR-CATALOG):
 *   ORDER_001 → 429: limite diário de ordens do plano atingido
 *   ORDER_002 → 402: saldo insuficiente
 *   ORDER_004 → 409: conflito de versão (lock otimista) — cliente deve retry
 *   ORDER_005 → 423: ativo em halt (circuit breaker)
 *
 * Nota: Rate limit da API = 100 req/60s por userId.
 * Sob carga real com um único usuário de teste, o rate limit SERÁ atingido.
 * Use múltiplos usuários de teste em ambiente de staging.
 *
 * Uso:
 *   Smoke:  k6 run --env SCENARIO=smoke --env AUTH_TOKEN=xxx tests/load/scenarios/06-order-create.js
 *   Carga:  k6 run --env AUTH_TOKEN=xxx tests/load/scenarios/06-order-create.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

const errorRate = new Rate('order_create_errors')
const latencyTrend = new Trend('order_create_latency_ms')
const rateLimitHits = new Counter('order_rate_limit_hits')
const optimisticLockConflicts = new Counter('order_optimistic_lock_conflicts')
const insufficientBalanceHits = new Counter('order_insufficient_balance')

const SLO_P95 = 800
const SLO_P99 = 2000

// Ordens simples de mercado para URU3 (A_TOP — mais líquido)
// Quantidade pequena para não esgotar saldo do usuário de teste
const ORDER_PAYLOAD = JSON.stringify({
  ticker: 'URU3',
  type: 'MARKET',
  side: 'BUY',
  quantity: 1,
})

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { scenario: 'smoke' },
    },
    average_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '5m', target: 10 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 30 },
        { duration: '5m', target: 30 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    order_create_errors: ['rate<0.05'], // tolerância maior por erros de negócio esperados
    http_req_failed: ['rate<0.05'],
  },
  tags: {
    commit: __ENV.COMMIT_SHA || 'local',
    scenario: __ENV.SCENARIO || 'default',
    service: 'foot-stock',
  },
}

const headers = {
  'Content-Type': 'application/json',
  ...(AUTH_TOKEN && { Authorization: `Bearer ${AUTH_TOKEN}` }),
}

export default function () {
  const res = http.post(`${BASE_URL}/api/v1/orders`, ORDER_PAYLOAD, {
    headers,
    tags: { endpoint: 'order_create' },
  })

  latencyTrend.add(res.timings.duration)

  // Rastrear erros de negócio esperados como métricas separadas
  if (res.status === 429) rateLimitHits.add(1)
  if (res.status === 409) optimisticLockConflicts.add(1)
  if (res.status === 402) insufficientBalanceHits.add(1)

  const ok = check(res, {
    'order_create: status 201 (sucesso) ou erro esperado': (r) =>
      [201, 402, 403, 409, 423, 429].includes(r.status),
    'order_create: NÃO retorna 500': (r) => r.status !== 500,
    'order_create: 409 retorna código ORDER_004': (r) => {
      if (r.status !== 409) return true
      try {
        const body = JSON.parse(r.body)
        return body.error?.code === 'ORDER_004'
      } catch {
        return false
      }
    },
    'order_create: 429 retorna código ORDER_001': (r) => {
      if (r.status !== 429) return true
      try {
        const body = JSON.parse(r.body)
        return body.error?.code === 'ORDER_001'
      } catch {
        return false
      }
    },
    'order_create: latência < SLO p95 (800ms)': (r) => r.timings.duration < SLO_P95,
  })

  errorRate.add(!ok)
  // Espera maior para não saturar rate limit (100 req/60s por userId)
  sleep(3)
}
