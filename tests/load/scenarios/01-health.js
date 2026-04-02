/**
 * Cenário 01 — Health Check (baseline)
 * Endpoint: GET /api/v1/health
 * Auth: Não
 * Tipo: static
 * SLO: p95 < 100ms, p99 < 200ms
 *
 * Uso:
 *   Smoke:  k6 run --env SCENARIO=smoke tests/load/scenarios/01-health.js
 *   Carga:  k6 run tests/load/scenarios/01-health.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const errorRate = new Rate('health_errors')
const latencyTrend = new Trend('health_latency_ms')

const SLO_P95 = 100
const SLO_P99 = 200

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
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    health_errors: ['rate<0.01'],
    http_req_failed: ['rate<0.05'],
  },
  tags: {
    commit: __ENV.COMMIT_SHA || 'local',
    scenario: __ENV.SCENARIO || 'default',
    service: 'foot-stock',
  },
}

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/health`, {
    tags: { endpoint: 'health' },
  })

  latencyTrend.add(res.timings.duration)

  const ok = check(res, {
    'health: status 200': (r) => r.status === 200,
    'health: latência < SLO p95 (100ms)': (r) => r.timings.duration < SLO_P95,
    'health: body não vazio': (r) => r.body && r.body.length > 0,
  })

  errorRate.add(!ok)
  sleep(1)
}
