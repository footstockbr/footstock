/**
 * Cenário 07 — Portfolio (Posições + Extrato)
 * Endpoints:
 *   GET /api/v1/positions
 *   GET /api/v1/transactions?limit=20
 * Auth: Bearer JWT
 * Tipo: crud_read (positions) + aggregated (transactions)
 * SLO: positions p95 < 200ms | transactions p95 < 500ms
 *
 * Criticidade: Alta — Tab 1 (Dashboard) e Tab 3 (Carteira) do app
 * Padrão de acesso: toda vez que usuário acessa o portfólio, ambas as queries rodam
 *
 * Uso:
 *   Smoke:  k6 run --env SCENARIO=smoke --env AUTH_TOKEN=xxx tests/load/scenarios/07-portfolio.js
 *   Carga:  k6 run --env AUTH_TOKEN=xxx tests/load/scenarios/07-portfolio.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

const errorRate = new Rate('portfolio_errors')
const positionsLatency = new Trend('positions_latency_ms')
const transactionsLatency = new Trend('transactions_latency_ms')

const SLO_POSITIONS_P95 = 200
const SLO_TRANSACTIONS_P95 = 500

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
        { duration: '2m', target: 40 },
        { duration: '5m', target: 40 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 120 },
        { duration: '5m', target: 120 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    'http_req_duration{endpoint:positions}': [`p(95)<${SLO_POSITIONS_P95}`],
    'http_req_duration{endpoint:transactions}': [`p(95)<${SLO_TRANSACTIONS_P95}`],
    portfolio_errors: ['rate<0.01'],
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
  // Batch: posições + transações (simula abertura do portfólio)
  const responses = http.batch([
    {
      method: 'GET',
      url: `${BASE_URL}/api/v1/positions`,
      params: { headers, tags: { endpoint: 'positions' } },
    },
    {
      method: 'GET',
      url: `${BASE_URL}/api/v1/transactions?limit=20`,
      params: { headers, tags: { endpoint: 'transactions' } },
    },
  ])

  const posRes = responses[0]
  const txRes = responses[1]

  positionsLatency.add(posRes.timings.duration)
  transactionsLatency.add(txRes.timings.duration)

  const posOk = check(posRes, {
    'positions: status 200': (r) => r.status === 200,
    'positions: retorna array': (r) => {
      try {
        const body = JSON.parse(r.body)
        return Array.isArray(body.data || body)
      } catch {
        return false
      }
    },
    'positions: latência < SLO p95 (200ms)': (r) => r.timings.duration < SLO_POSITIONS_P95,
  })

  const txOk = check(txRes, {
    'transactions: status 200': (r) => r.status === 200,
    'transactions: retorna array paginado': (r) => {
      try {
        const body = JSON.parse(r.body)
        return Array.isArray(body.data) && body.pagination !== undefined
      } catch {
        return false
      }
    },
    'transactions: latência < SLO p95 (500ms)': (r) => r.timings.duration < SLO_TRANSACTIONS_P95,
  })

  errorRate.add(!posOk || !txOk)
  sleep(2)
}
