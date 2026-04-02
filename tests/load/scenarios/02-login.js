/**
 * Cenário 02 — Autenticação (Login)
 * Endpoint: POST /api/v1/auth/login
 * Auth: Não (é o fluxo de login)
 * Tipo: auth
 * SLO: p95 < 800ms, p99 < 2000ms
 *
 * Variáveis de ambiente:
 *   BASE_URL         URL base da aplicação (padrão: http://localhost:3000)
 *   LOAD_TEST_USER   E-mail do usuário de carga (padrão: loadtest@footstock.com.br)
 *   LOAD_TEST_PASS   Senha do usuário de carga (padrão: LoadTest@123)
 *
 * Nota ERROR-CATALOG:
 *   - Credenciais inválidas → 401 (AUTH_002) — NÃO deve ocorrer em carga normal
 *   - Rate limit 5 tentativas/15min por e-mail → 429 — monitorar sob stress
 *
 * Uso:
 *   Smoke:  k6 run --env SCENARIO=smoke tests/load/scenarios/02-login.js
 *   Carga:  k6 run tests/load/scenarios/02-login.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@footstock.com.br'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'

const errorRate = new Rate('login_errors')
const latencyTrend = new Trend('login_latency_ms')

const SLO_P95 = 800
const SLO_P99 = 2000

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
        { duration: '2m', target: 20 },
        { duration: '5m', target: 20 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    login_errors: ['rate<0.01'],
    http_req_failed: ['rate<0.05'],
  },
  tags: {
    commit: __ENV.COMMIT_SHA || 'local',
    scenario: __ENV.SCENARIO || 'default',
    service: 'foot-stock',
  },
}

export default function () {
  const payload = JSON.stringify({
    email: LOAD_TEST_USER,
    password: LOAD_TEST_PASS,
  })

  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'login' },
  })

  latencyTrend.add(res.timings.duration)

  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: retorna token': (r) => {
      if (r.status !== 200) return false
      try {
        const body = JSON.parse(r.body)
        return !!(body.data?.accessToken || body.data?.access_token || body.accessToken)
      } catch {
        return false
      }
    },
    'login: NÃO retorna 401 (credenciais inválidas)': (r) => r.status !== 401,
    'login: NÃO retorna 429 (rate limit)': (r) => r.status !== 429,
    'login: latência < SLO p95 (800ms)': (r) => r.timings.duration < SLO_P95,
  })

  errorRate.add(!ok)
  sleep(2)
}
