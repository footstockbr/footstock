// ============================================================================
// FootStock Motor — Runtime config das camadas
// Lê a configuração salva pelo admin em Redis e converte para ClusterParams.
// ============================================================================

import type Redis from 'ioredis'
import type { AssetCluster, ClusterParams, SessionType } from '../types/motor.types'
import { CLUSTER_PARAMS } from '../microstructure/clusters'
import { SESSION_SCHEDULE, CLOSED_SESSION } from '../config/SessionConfig'

export const MOTOR_LAYERS_CONFIG_REDIS_KEY = 'motor:layers:config:v1'

const CACHE_TTL_MS = 10_000
const CLUSTERS: AssetCluster[] = ['A_TOP', 'A_MID', 'A_SMALL', 'B_LIQUID', 'B_ILLIQ']
const SESSION_TYPES: SessionType[] = ['PRE_OPENING', 'TRADING', 'CLOSING_CALL', 'AFTER_MARKET', 'CLOSED']

type AdminMotorLayersConfig = {
  ou: { clusters: Record<AssetCluster, { sigma: number; theta: number; spread_base: number }> }
  fundamentalReversion: { reversion_rate: number }
  garch: { omega: number; alpha: number; beta: number; vol_cap: number }
  ofi: { clusters: Record<AssetCluster, { rho: number }> }
  kylesLambda: { lambda_scale: number }
  supplyScaling: { amp_cap: number }
  pressureQueue: { pressure_spread_ticks: number; absorption_ticks: number; spot_cap: number }
  velocityCap: { max_per_tick: number }
  circuitBreaker: { halt_trigger: number; halt_duration_s: number }
  sessionManagement: { sessions: Record<SessionType, { vol_multiplier: number }> }
  updatedAt?: string | null
  updatedBy?: string | null
}

export type RuntimeMotorLayerConfig = {
  source: 'redis' | 'defaults'
  updatedAt: string | null
  updatedBy: string | null
  clusterParams: Record<AssetCluster, ClusterParams>
  sessionMultipliers: Record<SessionType, number>
  haltDurationMs: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function defaultSessionMultipliers(): Record<SessionType, number> {
  const out = {} as Record<SessionType, number>
  for (const session of SESSION_SCHEDULE) out[session.type] = session.volatilityMultiplier
  out.CLOSED = CLOSED_SESSION.volatilityMultiplier
  return out
}

function defaultRuntimeConfig(): RuntimeMotorLayerConfig {
  return {
    source: 'defaults',
    updatedAt: null,
    updatedBy: null,
    clusterParams: { ...CLUSTER_PARAMS },
    sessionMultipliers: defaultSessionMultipliers(),
    haltDurationMs: 300_000,
  }
}

function parseConfig(raw: string | null): AdminMotorLayersConfig | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AdminMotorLayersConfig

    for (const cluster of CLUSTERS) {
      const ou = parsed.ou?.clusters?.[cluster]
      const ofi = parsed.ofi?.clusters?.[cluster]
      if (!ou || !ofi) return null
      if (!isFiniteNumber(ou.sigma) || !isFiniteNumber(ou.theta) || !isFiniteNumber(ou.spread_base)) return null
      if (!isFiniteNumber(ofi.rho)) return null
    }

    const requiredNumbers = [
      parsed.fundamentalReversion?.reversion_rate,
      parsed.garch?.omega,
      parsed.garch?.alpha,
      parsed.garch?.beta,
      parsed.garch?.vol_cap,
      parsed.kylesLambda?.lambda_scale,
      parsed.supplyScaling?.amp_cap,
      parsed.pressureQueue?.pressure_spread_ticks,
      parsed.pressureQueue?.absorption_ticks,
      parsed.pressureQueue?.spot_cap,
      parsed.velocityCap?.max_per_tick,
      parsed.circuitBreaker?.halt_trigger,
      parsed.circuitBreaker?.halt_duration_s,
    ]
    if (requiredNumbers.some((value) => !isFiniteNumber(value))) return null

    for (const session of SESSION_TYPES) {
      if (!isFiniteNumber(parsed.sessionManagement?.sessions?.[session]?.vol_multiplier)) return null
    }

    return parsed
  } catch {
    return null
  }
}

function toRuntimeConfig(config: AdminMotorLayersConfig | null): RuntimeMotorLayerConfig {
  if (!config) return defaultRuntimeConfig()

  const clusterParams = {} as Record<AssetCluster, ClusterParams>
  for (const cluster of CLUSTERS) {
    const base = CLUSTER_PARAMS[cluster]
    const ou = config.ou.clusters[cluster]
    const ofi = config.ofi.clusters[cluster]
    clusterParams[cluster] = {
      ...base,
      theta: clamp(ou.theta, 0.01, 1.0),
      sigma: clamp(ou.sigma, 0.0001, 0.02),
      spread: clamp(ou.spread_base, 0.0001, 0.05),
      garchAlpha: clamp(config.garch.alpha, 0.01, 0.50),
      garchBeta: clamp(config.garch.beta, 0.01, 0.99),
      garchOmega: clamp(config.garch.omega, 0.0000001, 0.0001),
      garchVolCap: clamp(config.garch.vol_cap, 1.0, 5.0),
      lambdaKyle: base.lambdaKyle * clamp(config.kylesLambda.lambda_scale, 0.1, 5.0),
      maxTickChange: clamp(config.velocityCap.max_per_tick, 0.0001, 0.05),
      ofiDecay: clamp(ofi.rho, 0.5, 0.9999),
      fundamentalReversionRate: clamp(config.fundamentalReversion.reversion_rate, 0.0001, 0.05),
      supplyAmpCap: clamp(config.supplyScaling.amp_cap, 1.0, 5.0),
      pressureSpreadTicks: Math.floor(clamp(config.pressureQueue.pressure_spread_ticks, 1, 100)),
      pressureAbsorptionTicks: Math.floor(clamp(config.pressureQueue.absorption_ticks, 5, 200)),
      pressureSpotCap: clamp(config.pressureQueue.spot_cap, 0.001, 0.10),
      circuitBreakerThreshold: clamp(config.circuitBreaker.halt_trigger, 0.01, 0.50),
    }
  }

  const sessionMultipliers = {} as Record<SessionType, number>
  for (const session of SESSION_TYPES) {
    sessionMultipliers[session] = clamp(config.sessionManagement.sessions[session].vol_multiplier, 0, 5)
  }

  return {
    source: 'redis',
    updatedAt: config.updatedAt ?? null,
    updatedBy: config.updatedBy ?? null,
    clusterParams,
    sessionMultipliers,
    haltDurationMs: Math.floor(clamp(config.circuitBreaker.halt_duration_s, 10, 3600)) * 1000,
  }
}

export class MotorLayerRuntimeConfigService {
  private cache: { loadedAt: number; config: RuntimeMotorLayerConfig } | null = null

  constructor(private readonly redis: Redis) {}

  async getConfig(): Promise<RuntimeMotorLayerConfig> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) {
      return this.cache.config
    }

    const raw = await this.redis.get(MOTOR_LAYERS_CONFIG_REDIS_KEY).catch(() => null)
    const config = toRuntimeConfig(parseConfig(raw))
    this.cache = { loadedAt: Date.now(), config }
    return config
  }
}
