import type Redis from 'ioredis'
import {
  MOTOR_LAYERS_CONFIG_REDIS_KEY,
  MotorLayerRuntimeConfigService,
} from '../MotorLayerRuntimeConfig'
import { CLUSTER_PARAMS } from '../../microstructure/clusters'

type RedisMock = {
  get: jest.Mock<Promise<string | null>, [string]>
}

const clusterConfig = (sigma: number, theta: number, spreadBase: number) => ({
  sigma,
  theta,
  spread_base: spreadBase,
})

function buildAdminConfig() {
  return {
    ou: {
      clusters: {
        A_TOP: clusterConfig(0.0042, 0.34, 0.0017),
        A_MID: clusterConfig(0.0025, 0.18, 0.001),
        A_SMALL: clusterConfig(0.0032, 0.08, 0.002),
        B_LIQUID: clusterConfig(0.0035, 0.23, 0.005),
        B_ILLIQ: clusterConfig(0.004, 0.25, 0.015),
      },
    },
    fundamentalReversion: { reversion_rate: 0.012 },
    garch: { omega: 0.000003, alpha: 0.2, beta: 0.7, vol_cap: 2.4 },
    ofi: {
      clusters: {
        A_TOP: { rho: 0.8765 },
        A_MID: { rho: 0.93 },
        A_SMALL: { rho: 0.95 },
        B_LIQUID: { rho: 0.96 },
        B_ILLIQ: { rho: 0.97 },
      },
    },
    kylesLambda: { lambda_scale: 1.8 },
    supplyScaling: { amp_cap: 3.2 },
    pressureQueue: {
      pressure_spread_ticks: 9,
      absorption_ticks: 88,
      spot_cap: 0.033,
    },
    velocityCap: { max_per_tick: 0.0123 },
    circuitBreaker: { halt_trigger: 0.065, halt_duration_s: 123 },
    sessionManagement: {
      sessions: {
        PRE_OPENING: { vol_multiplier: 0.45 },
        TRADING: { vol_multiplier: 1.15 },
        CLOSING_CALL: { vol_multiplier: 0.25 },
        AFTER_MARKET: { vol_multiplier: 0.12 },
        CLOSED: { vol_multiplier: 0 },
      },
    },
    updatedAt: '2026-06-05T12:00:00.000Z',
    updatedBy: 'admin-e2e',
  }
}

function serviceWith(raw: string | null) {
  const redis: RedisMock = {
    get: jest.fn(async (_key: string) => raw),
  }
  return {
    redis,
    service: new MotorLayerRuntimeConfigService(redis as unknown as Redis),
  }
}

describe('MotorLayerRuntimeConfigService', () => {
  test('converte a configuração admin salva no Redis para parâmetros efetivos do motor', async () => {
    const adminConfig = buildAdminConfig()
    const { redis, service } = serviceWith(JSON.stringify(adminConfig))

    const runtime = await service.getConfig()
    const aTop = runtime.clusterParams.A_TOP

    expect(redis.get).toHaveBeenCalledWith(MOTOR_LAYERS_CONFIG_REDIS_KEY)
    expect(runtime.source).toBe('redis')
    expect(runtime.updatedAt).toBe(adminConfig.updatedAt)
    expect(runtime.updatedBy).toBe(adminConfig.updatedBy)
    expect(runtime.haltDurationMs).toBe(123_000)
    expect(runtime.sessionMultipliers).toMatchObject({
      PRE_OPENING: 0.45,
      TRADING: 1.15,
      CLOSING_CALL: 0.25,
      AFTER_MARKET: 0.12,
      CLOSED: 0,
    })
    expect(aTop.sigma).toBe(0.0042)
    expect(aTop.theta).toBe(0.34)
    expect(aTop.spread).toBe(0.0017)
    expect(aTop.garchAlpha).toBe(0.2)
    expect(aTop.garchBeta).toBe(0.7)
    expect(aTop.garchOmega).toBe(0.000003)
    expect(aTop.garchVolCap).toBe(2.4)
    expect(aTop.ofiDecay).toBe(0.8765)
    expect(aTop.lambdaKyle).toBeCloseTo(CLUSTER_PARAMS.A_TOP.lambdaKyle * 1.8, 10)
    expect(aTop.maxTickChange).toBe(0.0123)
    expect(aTop.fundamentalReversionRate).toBe(0.012)
    expect(aTop.supplyAmpCap).toBe(3.2)
    expect(aTop.pressureSpreadTicks).toBe(9)
    expect(aTop.pressureAbsorptionTicks).toBe(88)
    expect(aTop.pressureSpotCap).toBe(0.033)
    expect(aTop.circuitBreakerThreshold).toBe(0.065)
  })

  test('usa defaults quando Redis não tem configuração válida', async () => {
    const { service } = serviceWith(JSON.stringify({ invalid: true }))

    const runtime = await service.getConfig()

    expect(runtime.source).toBe('defaults')
    expect(runtime.updatedAt).toBeNull()
    expect(runtime.updatedBy).toBeNull()
    expect(runtime.clusterParams.A_TOP).toMatchObject(CLUSTER_PARAMS.A_TOP)
    expect(runtime.sessionMultipliers.CLOSED).toBe(0)
    expect(runtime.haltDurationMs).toBe(300_000)
  })
})
