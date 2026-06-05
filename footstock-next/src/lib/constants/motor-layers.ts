import type { MotorLayersConfig } from '@/lib/types/admin'

export const MOTOR_LAYERS_DEFAULTS: Omit<MotorLayersConfig, 'updatedAt' | 'updatedBy'> = {
  ou: {
    clusters: {
      A_TOP:    { sigma: 0.0018, theta: 0.12, spread_base: 0.0005 },
      A_MID:    { sigma: 0.0025, theta: 0.18, spread_base: 0.0010 },
      A_SMALL:  { sigma: 0.0032, theta: 0.08, spread_base: 0.0020 },
      B_LIQUID: { sigma: 0.0035, theta: 0.23, spread_base: 0.0050 },
      B_ILLIQ:  { sigma: 0.0040, theta: 0.25, spread_base: 0.0150 },
    },
  },
  fundamentalReversion: { reversion_rate: 0.003 },
  garch: { omega: 0.000002, alpha: 0.12, beta: 0.85, vol_cap: 1.8 },
  ofi: {
    clusters: {
      A_TOP:    { rho: 0.91 },
      A_MID:    { rho: 0.93 },
      A_SMALL:  { rho: 0.95 },
      B_LIQUID: { rho: 0.96 },
      B_ILLIQ:  { rho: 0.97 },
    },
  },
  kylesLambda: { lambda_scale: 1.0 },
  supplyScaling: { amp_cap: 2.0 },
  pressureQueue: { pressure_spread_ticks: 10, absorption_ticks: 40, spot_cap: 0.025 },
  velocityCap: { max_per_tick: 0.0035 },
  circuitBreaker: { halt_trigger: 0.08, halt_duration_s: 300 },
  sessionManagement: {
    sessions: {
      PRE_OPENING:  { vol_multiplier: 0.30 },
      TRADING:      { vol_multiplier: 1.00 },
      CLOSING_CALL: { vol_multiplier: 0.20 },
      AFTER_MARKET: { vol_multiplier: 0.10 },
      CLOSED:       { vol_multiplier: 0.00 },
    },
  },
}
