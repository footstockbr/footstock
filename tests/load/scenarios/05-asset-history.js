/**
 * Cenário 05 — Histórico OHLC de Preços (consulta agregada pesada)
 * Endpoint: GET /api/v1/assets/{ticker}/history?period=1h&limit=100
 * Auth: Bearer JWT
 * Tipo: aggregated
 * SLO: p95 < 500ms, p99 < 1000ms
 *
 * Criticidade: Alta — chamada ao abrir gráfico de qualquer ativo (tela de detalhe)
 * Restrição: apenas planos Craque e Lenda têm acesso pleno → 403 para Jogador (ASSET_001)
 * Gargalo potencial: query de time-series no PostgreSQL com window functions
 *
 * Uso:
 *   Smoke:  k6 run --env SCENARIO=smoke --env AUTH_TOKEN=xxx tests/load/scenarios/05-asset-history.js
 *   Carga:  k6 run --env AUTH_TOKEN=xxx tests/load/scenarios/05-asset-history.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

const errorRate = new Rate('asset_history_errors')
const latencyTrend = new Trend('asset_history_latency_ms')

const SLO_P95 = 500
const SLO_P99 = 1000

const TICKERS = ['URU3', 'POR4', 'TIM3', 'VOZ3']
const PERIODS = ['1h', '1d', '5m']

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
        { duration: '2m', target: 30 },
        { duration: '5m', target: 30 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    asset_history_errors: ['rate<0.01'],
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
  const ticker = TICKERS[Math.floor(Math.random() * TICKERS.length)]
  const period = PERIODS[Math.floor(Math.random() * PERIODS.length)]

  const res = http.get(
    `${BASE_URL}/api/v1/assets/${ticker}/history?period=${period}&limit=100`,
    {
      headers,
      tags: { endpoint: 'asset_history', ticker, period },
    }
  )

  latencyTrend.add(res.timings.duration)

  const ok = check(res, {
    'asset_history: status 200 ou 403 (plano Jogador)': (r) =>
      r.status === 200 || r.status === 403,
    'asset_history: retorna array de candles': (r) => {
      if (r.status !== 200) return true // 403 é esperado para Jogador
      try {
        const body = JSON.parse(r.body)
        return Array.isArray(body.data)
      } catch {
        return false
      }
    },
    'asset_history: candle tem OHLC': (r) => {
      if (r.status !== 200) return true
      try {
        const body = JSON.parse(r.body)
        if (!body.data || body.data.length === 0) return true
        const c = body.data[0]
        return (
          typeof c.open === 'number' &&
          typeof c.high === 'number' &&
          typeof c.low === 'number' &&
          typeof c.close === 'number'
        )
      } catch {
        return false
      }
    },
    'asset_history: latência < SLO p95 (500ms)': (r) => r.timings.duration < SLO_P95,
  })

  errorRate.add(!ok)
  sleep(2)
}
