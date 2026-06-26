/**
 * Testes unitários — SSoT do Circuit Breaker (read-merge-write em motor:layers:config:v1)
 * Cobre: defaults, preservação das demais camadas, clamp, back-compat (blob sem `enabled`)
 * e toggle isolado preservando o limiar.
 */

const store: Record<string, string> = {}

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    get: jest.fn(async (k: string) => store[k] ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store[k] = v
    }),
  },
}))

import {
  readCircuitBreakerConfig,
  writeCircuitBreakerConfig,
  MOTOR_LAYERS_REDIS_KEY,
} from '@/lib/motor/circuit-breaker-config'
import { MOTOR_LAYERS_DEFAULTS } from '@/lib/constants/motor-layers'

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
})

describe('circuit-breaker-config SSoT', () => {
  it('lê defaults (enabled=true, 8%) quando não há blob', async () => {
    const { config, source } = await readCircuitBreakerConfig()
    expect(source).toBe('defaults')
    expect(config.enabled).toBe(true)
    expect(config.halt_trigger).toBeCloseTo(0.08)
  })

  it('write atualiza só circuitBreaker e PRESERVA as outras camadas', async () => {
    store[MOTOR_LAYERS_REDIS_KEY] = JSON.stringify({
      ...MOTOR_LAYERS_DEFAULTS,
      velocityCap: { max_per_tick: 0.0099 }, // customização em outra camada
      circuitBreaker: { enabled: true, halt_trigger: 0.08, halt_duration_s: 300 },
    })

    const next = await writeCircuitBreakerConfig({ enabled: false, halt_trigger: 0.12 }, 'admin-1')

    expect(next.enabled).toBe(false)
    expect(next.halt_trigger).toBeCloseTo(0.12)

    const stored = JSON.parse(store[MOTOR_LAYERS_REDIS_KEY])
    expect(stored.velocityCap.max_per_tick).toBe(0.0099) // intacto
    expect(stored.circuitBreaker.enabled).toBe(false)
    expect(stored.updatedBy).toBe('admin-1')
    expect(typeof stored.updatedAt).toBe('string')
  })

  it('clampa halt_trigger em [0.01, 0.50]', async () => {
    const high = await writeCircuitBreakerConfig({ halt_trigger: 0.99 }, 'a')
    expect(high.halt_trigger).toBe(0.5)
    const low = await writeCircuitBreakerConfig({ halt_trigger: 0.001 }, 'a')
    expect(low.halt_trigger).toBe(0.01)
  })

  it('blob legado sem `enabled` resolve enabled=true ao ler', async () => {
    store[MOTOR_LAYERS_REDIS_KEY] = JSON.stringify({
      ...MOTOR_LAYERS_DEFAULTS,
      circuitBreaker: { halt_trigger: 0.1, halt_duration_s: 300 }, // sem enabled
    })
    const { config } = await readCircuitBreakerConfig()
    expect(config.enabled).toBe(true)
    expect(config.halt_trigger).toBeCloseTo(0.1)
  })

  it('toggle isolado (só enabled) preserva o limiar atual', async () => {
    store[MOTOR_LAYERS_REDIS_KEY] = JSON.stringify({
      ...MOTOR_LAYERS_DEFAULTS,
      circuitBreaker: { enabled: true, halt_trigger: 0.15, halt_duration_s: 300 },
    })
    const next = await writeCircuitBreakerConfig({ enabled: false }, 'a')
    expect(next.enabled).toBe(false)
    expect(next.halt_trigger).toBeCloseTo(0.15) // mantido
  })
})
