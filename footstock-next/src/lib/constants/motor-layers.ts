import type { MotorLayersConfig, MotorLayerToggleKey } from '@/lib/types/admin'

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
  circuitBreaker: { enabled: true, halt_trigger: 0.08, halt_duration_s: 300 },
  sessionManagement: {
    sessions: {
      PRE_OPENING:  { vol_multiplier: 0.30 },
      TRADING:      { vol_multiplier: 1.00 },
      CLOSING_CALL: { vol_multiplier: 0.20 },
      AFTER_MARKET: { vol_multiplier: 0.10 },
      CLOSED:       { vol_multiplier: 0.00 },
    },
  },
  // Toggle por camada (default tudo ligado = comportamento idêntico ao atual). O circuit
  // breaker tem seu próprio enabled (circuitBreaker.enabled), fora deste mapa.
  layerToggles: {
    ou:                   true,
    fundamentalReversion: true,
    garch:                true,
    ofi:                  true,
    kylesLambda:          true,
    supplyScaling:        true,
    pressureQueue:        true,
    velocityCap:          true,
    sessionManagement:    true,
  },
}

// ─── Contrato de layerToggles (Task 007: preservar compatibilidade) ──────────
//
// `motor-layers.ts` e a FONTE UNICA do contrato de camadas. A rota admin e o motor
// consomem as chaves canonicas e a normalizacao daqui, sem redefinir o conjunto de
// camadas em outro lugar (evita drift). `layerToggles` e configuracao ADITIVA/LEGADA:
// blobs antigos sem o campo continuam validos (default = todas habilitadas) e o estado
// de PAUSA nunca e derivado deste mapa (pausa vive em controle separado: motor:global-halt
// + isPaused/asset.isHalted).

/**
 * Chaves canonicas dos toggles de camada, derivadas do proprio default acima para que
 * adicionar/remover uma camada no default propague aqui sem drift. Consumido pela rota
 * admin (rejeicao de camada desconhecida no payload de ENTRADA) e por qualquer consumidor
 * que precise do conjunto autoritativo de camadas.
 */
export const MOTOR_LAYER_TOGGLE_KEYS = Object.keys(
  MOTOR_LAYERS_DEFAULTS.layerToggles,
) as MotorLayerToggleKey[]

/**
 * Normaliza um mapa parcial/ausente de `layerToggles` para a forma canonica completa.
 * - Ausente (undefined/null): retorna o default (todas as camadas habilitadas).
 * - Parcial: preenche as chaves faltantes com o default por camada (true); nao falha.
 * Nunca deriva estado de pausa a partir de `layerToggles`. Chaves desconhecidas sao
 * ignoradas aqui apenas como defesa retrocompativel contra blobs JA PERSISTIDOS ou objetos
 * internos inesperados; a rejeicao de camada desconhecida no payload de ENTRADA e
 * responsabilidade da rota admin (400 + erro de contrato), nao desta normalizacao.
 */
export function normalizeLayerToggles(
  partial?: Partial<Record<MotorLayerToggleKey, boolean>> | null,
): Record<MotorLayerToggleKey, boolean> {
  const out = { ...MOTOR_LAYERS_DEFAULTS.layerToggles }
  if (!partial || typeof partial !== 'object') return out
  for (const key of MOTOR_LAYER_TOGGLE_KEYS) {
    const v = partial[key]
    if (typeof v === 'boolean') out[key] = v
  }
  return out
}
