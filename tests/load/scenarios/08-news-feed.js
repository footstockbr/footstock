/**
 * Cenário 08 — Feed de Notícias
 * Endpoint: GET /api/v1/news
 * Auth: Bearer JWT
 * Tipo: aggregated
 * SLO: p95 < 500ms, p99 < 1000ms
 *
 * Criticidade: Média-Alta — Tab 4 do app; resposta cacheada no Redis (TTL 5min)
 * Gargalo potencial: cache miss força query no banco + classificação Haiku
 * Nota: agregação RSS ocorre a cada 5 minutos no footstock-news-server (serviço separado)
 *
 * Uso:
 *   Smoke:  k6 run --env SCENARIO=smoke --env AUTH_TOKEN=xxx tests/load/scenarios/08-news-feed.js
 *   Carga:  k6 run --env AUTH_TOKEN=xxx tests/load/scenarios/08-news-feed.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

const errorRate = new Rate('news_errors')
const latencyTrend = new Trend('news_latency_ms')
const cacheMissLatency = new Trend('news_cache_miss_latency_ms')

const SLO_P95 = 500
const SLO_P99 = 1000
const CACHE_MISS_THRESHOLD_MS = 2000 // cache miss pode ser mais lento

const TICKERS_FILTER = ['URU3', 'POR4', undefined] // undefined = sem filtro

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
        { duration: '2m', target: 25 },
        { duration: '5m', target: 25 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 80 },
        { duration: '5m', target: 80 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    news_errors: ['rate<0.01'],
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
  const ticker = TICKERS_FILTER[Math.floor(Math.random() * TICKERS_FILTER.length)]
  const url = ticker
    ? `${BASE_URL}/api/v1/news?ticker=${ticker}`
    : `${BASE_URL}/api/v1/news`

  const res = http.get(url, {
    headers,
    tags: { endpoint: 'news_feed', ticker: ticker || 'all' },
  })

  latencyTrend.add(res.timings.duration)

  // Detectar possível cache miss (latência > 2x do SLO normal)
  if (res.timings.duration > CACHE_MISS_THRESHOLD_MS) {
    cacheMissLatency.add(res.timings.duration)
  }

  const ok = check(res, {
    'news: status 200': (r) => r.status === 200,
    'news: retorna array': (r) => {
      try {
        const body = JSON.parse(r.body)
        return Array.isArray(body.data || body)
      } catch {
        return false
      }
    },
    'news: itens têm título e fonte': (r) => {
      try {
        const body = JSON.parse(r.body)
        const arr = body.data || body
        if (!Array.isArray(arr) || arr.length === 0) return true
        return !!arr[0].title && !!arr[0].source
      } catch {
        return false
      }
    },
    'news: latência < SLO p95 (500ms)': (r) => r.timings.duration < SLO_P95,
  })

  errorRate.add(!ok)
  sleep(2)
}
