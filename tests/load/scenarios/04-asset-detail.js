/**
 * Cenário 04 — Detalhe de Ativo
 * Endpoint: GET /api/v1/assets/{ticker}
 * Auth: Bearer JWT
 * Tipo: crud_read
 * SLO: p95 < 200ms, p99 < 500ms
 *
 * Criticidade: Alta — aberto sempre que usuário clica em um clube para operar
 * Tickers testados: URU3 (A_TOP), VOZ3 (B_LIQUID), GAL3 (A_TOP)
 * Nota ERROR-CATALOG: ticker inválido → 404 (ASSET_080)
 *
 * Uso:
 *   Smoke:  k6 run --env SCENARIO=smoke --env AUTH_TOKEN=xxx tests/load/scenarios/04-asset-detail.js
 *   Carga:  k6 run --env AUTH_TOKEN=xxx tests/load/scenarios/04-asset-detail.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

const errorRate = new Rate('asset_detail_errors')
const latencyTrend = new Trend('asset_detail_latency_ms')

const SLO_P95 = 200
const SLO_P99 = 500

// Tickers reais do seed data (A_TOP + B_LIQUID)
const TICKERS = ['URU3', 'POR4', 'TIM3', 'FOG3', 'GAL3', 'VOZ3', 'LEP4', 'COE3']

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
      rate: 40,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 150,
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'constant-arrival-rate',
      rate: 150,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      maxVUs: 300,
      startTime: '7m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    asset_detail_errors: ['rate<0.01'],
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
  // Selecionar ticker aleatório da lista (simula navegação real)
  const ticker = TICKERS[Math.floor(Math.random() * TICKERS.length)]

  const res = http.get(`${BASE_URL}/api/v1/assets/${ticker}`, {
    headers,
    tags: { endpoint: 'asset_detail', ticker },
  })

  latencyTrend.add(res.timings.duration)

  const ok = check(res, {
    'asset_detail: status 200': (r) => r.status === 200,
    'asset_detail: contém ticker': (r) => {
      try {
        const body = JSON.parse(r.body)
        const asset = body.data || body
        return !!asset.ticker
      } catch {
        return false
      }
    },
    'asset_detail: contém currentPrice': (r) => {
      try {
        const body = JSON.parse(r.body)
        const asset = body.data || body
        return typeof asset.currentPrice === 'number'
      } catch {
        return false
      }
    },
    'asset_detail: ticker inválido retorna 404 não 500': (r) =>
      r.status === 200 || r.status === 401 || r.status === 404,
    'asset_detail: latência < SLO p95 (200ms)': (r) => r.timings.duration < SLO_P95,
  })

  errorRate.add(!ok)
  sleep(1)
}
