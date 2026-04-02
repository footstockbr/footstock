/**
 * Orquestrador de Load Tests — Foot Stock
 *
 * Uso:
 *   Smoke (padrão):  BASE_URL=http://localhost:3000 AUTH_TOKEN=xxx k6 run tests/load/run-all.js
 *   Carga média:     k6 run --env SCENARIO=average_load --env AUTH_TOKEN=xxx tests/load/run-all.js
 *   Stress:          k6 run --env SCENARIO=stress --env AUTH_TOKEN=xxx tests/load/run-all.js
 *
 * Para executar cenários individualmente:
 *   k6 run --env AUTH_TOKEN=xxx tests/load/scenarios/03-assets-list.js
 *
 * Variáveis de ambiente:
 *   BASE_URL         URL base (padrão: http://localhost:3000)
 *   AUTH_TOKEN       Bearer token JWT — obrigatório para cenários autenticados
 *   LOAD_TEST_USER   E-mail do usuário de carga (para 02-login.js)
 *   LOAD_TEST_PASS   Senha do usuário de carga (para 02-login.js)
 *   COMMIT_SHA       SHA do commit para tags de rastreabilidade
 *   SCENARIO         smoke | average_load | stress (padrão: smoke)
 *
 * Notas:
 *   - Smoke test: 1 VU, 1 minuto (validação de scripts)
 *   - Carga média: ~50-200 req/s (Fase 1: 500 DAU, 50 ordens/min)
 *   - Stress: 150-400 req/s (Fase 2: 5.000 DAU)
 *   - k6 retorna exit code 1 se thresholds violados (usar em CI/CD como gate)
 */
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js'

// SLOs globais do projeto (PRD: p95 < 200ms CRUD, p95 < 500ms agregados)
export const options = {
  scenarios: {
    health_check: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      exec: 'healthScenario',
      tags: { scenario: 'smoke_health' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
  tags: {
    commit: __ENV.COMMIT_SHA || 'local',
    service: 'foot-stock',
    run_type: __ENV.SCENARIO || 'smoke',
  },
}

import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

const headers = {
  'Content-Type': 'application/json',
  ...(AUTH_TOKEN && { Authorization: `Bearer ${AUTH_TOKEN}` }),
}

// Cenário de smoke mínimo: health + assets
export function healthScenario() {
  const healthRes = http.get(`${BASE_URL}/api/v1/health`)
  check(healthRes, {
    'health: status 200': (r) => r.status === 200,
    'health: < 100ms': (r) => r.timings.duration < 100,
  })

  sleep(0.5)

  if (AUTH_TOKEN) {
    const assetsRes = http.get(`${BASE_URL}/api/v1/assets`, { headers })
    check(assetsRes, {
      'assets: status 200': (r) => r.status === 200,
      'assets: < 200ms': (r) => r.timings.duration < 200,
    })
  }

  sleep(1)
}

export default healthScenario

export function handleSummary(data) {
  const result = {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'tests/load/results/summary.json': JSON.stringify(data, null, 2),
  }
  return result
}
