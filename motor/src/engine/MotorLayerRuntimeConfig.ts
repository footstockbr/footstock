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
export const CANONICAL_LAYER_TOGGLE_KEYS = [
  'ou',
  'fundamentalReversion',
  'garch',
  'ofi',
  'kylesLambda',
  'supplyScaling',
  'pressureQueue',
  'velocityCap',
  'sessionManagement',
] as const

type AdminMotorLayersConfig = {
  ou: { clusters: Record<AssetCluster, { sigma: number; theta: number; spread_base: number }> }
  fundamentalReversion: { reversion_rate: number }
  garch: { omega: number; alpha: number; beta: number; vol_cap: number }
  ofi: { clusters: Record<AssetCluster, { rho: number }> }
  kylesLambda: { lambda_scale: number }
  supplyScaling: { amp_cap: number }
  pressureQueue: { pressure_spread_ticks: number; absorption_ticks: number; spot_cap: number }
  velocityCap: { max_per_tick: number }
  circuitBreaker: { enabled?: boolean; halt_trigger: number; halt_duration_s: number }
  sessionManagement: { sessions: Record<SessionType, { vol_multiplier: number }> }
  layerToggles?: Partial<Record<string, boolean>>
  updatedAt?: string | null
  updatedBy?: string | null
}

export type RuntimeMotorLayerConfig = {
  source: 'redis' | 'defaults'
  updatedAt: string | null
  updatedBy: string | null
  diagnostics: string[]
  clusterParams: Record<AssetCluster, ClusterParams>
  sessionMultipliers: Record<SessionType, number>
  haltDurationMs: number
}

type ParsedConfig = {
  config: AdminMotorLayersConfig | null
  diagnostics: string[]
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

function defaultRuntimeConfig(diagnostics: string[] = []): RuntimeMotorLayerConfig {
  return {
    source: 'defaults',
    updatedAt: null,
    updatedBy: null,
    diagnostics,
    clusterParams: { ...CLUSTER_PARAMS },
    sessionMultipliers: defaultSessionMultipliers(),
    haltDurationMs: 300_000,
  }
}

function parseConfig(raw: string | null): ParsedConfig {
  if (!raw) return { config: null, diagnostics: ['redis_config_missing'] }
  try {
    const parsed = JSON.parse(raw) as AdminMotorLayersConfig

    for (const cluster of CLUSTERS) {
      const ou = parsed.ou?.clusters?.[cluster]
      const ofi = parsed.ofi?.clusters?.[cluster]
      if (!ou || !ofi) return { config: null, diagnostics: [`missing_cluster_config:${cluster}`] }
      if (!isFiniteNumber(ou.sigma) || !isFiniteNumber(ou.theta) || !isFiniteNumber(ou.spread_base)) {
        return { config: null, diagnostics: [`invalid_ou_cluster_config:${cluster}`] }
      }
      if (!isFiniteNumber(ofi.rho)) return { config: null, diagnostics: [`invalid_ofi_cluster_config:${cluster}`] }
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
    if (requiredNumbers.some((value) => !isFiniteNumber(value))) {
      return { config: null, diagnostics: ['required_number_invalid_or_missing'] }
    }

    if (parsed.garch.alpha + parsed.garch.beta >= 1) {
      return { config: null, diagnostics: ['garch_alpha_beta_not_stationary'] }
    }

    for (const session of SESSION_TYPES) {
      if (!isFiniteNumber(parsed.sessionManagement?.sessions?.[session]?.vol_multiplier)) {
        return { config: null, diagnostics: [`invalid_session_multiplier:${session}`] }
      }
    }

    return { config: parsed, diagnostics: [] }
  } catch {
    return { config: null, diagnostics: ['json_parse_failed'] }
  }
}

function normalizeLayerToggles(raw: AdminMotorLayersConfig['layerToggles']): {
  values: Record<(typeof CANONICAL_LAYER_TOGGLE_KEYS)[number], boolean>
  diagnostics: string[]
} {
  const diagnostics: string[] = []
  const values = {} as Record<(typeof CANONICAL_LAYER_TOGGLE_KEYS)[number], boolean>
  const rawRecord = raw ?? {}
  const allowed = new Set<string>(CANONICAL_LAYER_TOGGLE_KEYS)

  for (const key of CANONICAL_LAYER_TOGGLE_KEYS) {
    const value = rawRecord[key]
    if (value === undefined) {
      values[key] = true
    } else if (typeof value === 'boolean') {
      values[key] = value
    } else {
      values[key] = true
      diagnostics.push(`layer_toggle_non_boolean:${key}`)
    }
  }

  for (const key of Object.keys(rawRecord)) {
    if (!allowed.has(key)) diagnostics.push(`layer_toggle_unknown:${key}`)
  }

  return { values, diagnostics }
}

function toRuntimeConfig(parsed: ParsedConfig): RuntimeMotorLayerConfig {
  const { config } = parsed
  if (!config) return defaultRuntimeConfig(parsed.diagnostics)

  const normalizedToggles = normalizeLayerToggles(config.layerToggles)
  const diagnostics = [...parsed.diagnostics, ...normalizedToggles.diagnostics]

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
      // enabled ausente (blob legado) => true: o halt automatico só desliga com toggle explícito.
      circuitBreakerEnabled: config.circuitBreaker.enabled ?? true,
      // Toggle por camada normalizado: ausente => ligado; valor inválido => ligado + diagnóstico.
      layersEnabled: normalizedToggles.values,
    }
  }

  // Camada sessionManagement desligada (toggle) => multiplicador neutro 1 em todas as sessões
  // (volatilidade constante, sem escala por sessão de mercado).
  const sessionEnabled = normalizedToggles.values.sessionManagement !== false
  const sessionMultipliers = {} as Record<SessionType, number>
  for (const session of SESSION_TYPES) {
    sessionMultipliers[session] = sessionEnabled
      ? clamp(config.sessionManagement.sessions[session].vol_multiplier, 0, 5)
      : 1
  }

  return {
    source: 'redis',
    updatedAt: config.updatedAt ?? null,
    updatedBy: config.updatedBy ?? null,
    diagnostics,
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
