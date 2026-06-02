/**
 * k6 Load Test — FootStock
 * Rastreabilidade: INT-123, TASK-3/ST002
 *
 * Uso:
 *   Smoke test:   k6 run --vus 10 --duration 10s tests/load/basic-load.js
 *   Load test:    k6 run tests/load/basic-load.js
 *   Staging:      BASE_URL=https://staging.footstock.app AUTH_TOKEN=xxx k6 run tests/load/basic-load.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Ramp-up gradual
    { duration: '1m', target: 500 },    // Carga sustentada (Fase 1 peak)
    { duration: '30s', target: 0 },     // Ramp-down
  ],
  thresholds: {
    // SLO Fase 1: p95 < 500ms, p99 < 2s
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    // Taxa de erro < 1%
    http_req_failed: ['rate<0.01'],
    // Checks devem passar > 95%
    checks: ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  ...(AUTH_TOKEN && { Authorization: `Bearer ${AUTH_TOKEN}` }),
};

export default function () {
  // --- Cenário 1: Health check (baseline — sem auth) ---
  const healthRes = http.get(`${BASE_URL}/api/v1/health`);
  check(healthRes, {
    'health: status 200': (r) => r.status === 200,
    'health: p95 < 100ms': (r) => r.timings.duration < 100,
  });

  sleep(0.5);

  // --- Cenário 2: Listar ativos (endpoint mais acessado) ---
  const assetsRes = http.get(`${BASE_URL}/api/v1/assets?page=1&limit=20`, { headers });
  check(assetsRes, {
    'assets: status 200': (r) => r.status === 200,
    'assets: retorna array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data || body);
      } catch {
        return false;
      }
    },
    'assets: p95 < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);

  // --- Cenário 3: Detalhe de ativo (segundo mais acessado) ---
  const detailRes = http.get(`${BASE_URL}/api/v1/assets/FLA3`, { headers });
  check(detailRes, {
    'detail: status 200 ou 404': (r) => r.status === 200 || r.status === 404,
    'detail: resposta valida': (r) => r.timings.duration < 500,
  });

  sleep(1);

  // --- Cenário 4: Preços em tempo real (se autenticado) ---
  if (AUTH_TOKEN) {
    const pricesRes = http.get(`${BASE_URL}/api/v1/assets/prices`, { headers });
    check(pricesRes, {
      'prices: status 200': (r) => r.status === 200,
      'prices: p95 < 500ms': (r) => r.timings.duration < 500,
    });
    sleep(0.5);
  }
}
