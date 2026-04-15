import type { MotorLayersConfig } from '@/lib/types/admin'

export const MOTOR_LAYERS_DEFAULTS: Omit<MotorLayersConfig, 'updatedAt' | 'updatedBy'> = {
  ou: {
    clusters: {
      A_TOP:    { sigma: 0.0018, theta: 0.20, spread_base: 0.003 },
      A_MID:    { sigma: 0.0025, theta: 0.18, spread_base: 0.005 },
      A_SMALL:  { sigma: 0.0030, theta: 0.15, spread_base: 0.008 },
      B_LIQUID: { sigma: 0.0035, theta: 0.14, spread_base: 0.010 },
      B_ILLIQ:  { sigma: 0.0040, theta: 0.12, spread_base: 0.012 },
    },
  },
  fundamentalReversion: { reversion_rate: 0.003 },
  garch: { omega: 0.000002, alpha: 0.12, beta: 0.85, vol_cap: 1.8 },
  ofi: {
    clusters: {
      A_TOP:    { rho: 0.97 },
      A_MID:    { rho: 0.95 },
      A_SMALL:  { rho: 0.93 },
      B_LIQUID: { rho: 0.92 },
      B_ILLIQ:  { rho: 0.91 },
    },
  },
  kylesLambda: { lambda_scale: 1.0 },
  supplyScaling: { amp_cap: 2.0 },
  pressureQueue: { pressure_spread_ticks: 10, absorption_ticks: 40, spot_cap: 0.025 },
  velocityCap: { max_per_tick: 0.0035 },
  circuitBreaker: { halt_trigger: 0.08, halt_duration_s: 300 },
  sessionManagement: {
    sessions: {
      OPEN:      { vol_multiplier: 1.4 },
      MID:       { vol_multiplier: 1.0 },
      PRE_CLOSE: { vol_multiplier: 1.2 },
      CLOSE:     { vol_multiplier: 0.8 },
      OVERNIGHT: { vol_multiplier: 0.3 },
    },
  },
}
