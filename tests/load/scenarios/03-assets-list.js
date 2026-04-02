/**
 * Cenário 03 — Listagem de Ativos (endpoint mais acessado)
 * Endpoint: GET /api/v1/assets
 * Auth: Bearer JWT
 * Tipo: crud_read
 * SLO: p95 < 200ms, p99 < 500ms
 *
 * Criticidade: Alta — tela principal do app, acessada por 100% dos usuários ativos
 * Nota: usuários Jogador recebem cotações com atraso de 60min (não impacta latência da query)
 *
 * Variáveis de ambiente:
 *   BASE_URL    URL base da aplicação
 *   AUTH_TOKEN  Bearer token JWT (obter via 02-login.js ou /create-test-user)
 *
 * Uso:
 *   Smoke:  k6 run --env SCENARIO=smoke --env AUTH_TOKEN=xxx tests/load/scenarios/03-assets-list.js
 *   Carga:  k6 run --env AUTH_TOKEN=xxx tests/load/scenarios/03-assets-list.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

const errorRate = new Rate('assets_list_errors')
const latencyTrend = new Trend('assets_list_latency_ms')

const SLO_P95 = 200
const SLO_P99 = 500

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { scenario: 'smoke' },
    },
    average_load: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      maxVUs: 400,
      startTime: '7m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    assets_list_errors: ['rate<0.01'],
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
  // Listagem completa (40 ativos)
  const res = http.get(`${BASE_URL}/api/v1/assets`, {
    headers,
    tags: { endpoint: 'assets_list' },
  })

  latencyTrend.add(res.timings.duration)

  const ok = check(res, {
    'assets_list: status 200': (r) => r.status === 200,
    'assets_list: retorna array': (r) => {
      try {
        const body = JSON.parse(r.body)
        const arr = body.data || body
        return Array.isArray(arr)
      } catch {
        return false
      }
    },
    'assets_list: 40 ativos retornados': (r) => {
      try {
        const body = JSON.parse(r.body)
        const arr = body.data || body
        return Array.isArray(arr) && arr.length === 40
      } catch {
        return false
      }
    },
    'assets_list: latência < SLO p95 (200ms)': (r) => r.timings.duration < SLO_P95,
  })

  errorRate.add(!ok)

  // Filtro por divisão A (Série A — 20 ativos)
  const resA = http.get(`${BASE_URL}/api/v1/assets?division=A`, {
    headers,
    tags: { endpoint: 'assets_list_filter' },
  })

  check(resA, {
    'assets_list_A: status 200': (r) => r.status === 200,
    'assets_list_A: latência < SLO p95': (r) => r.timings.duration < SLO_P95,
  })

  sleep(1)
}
