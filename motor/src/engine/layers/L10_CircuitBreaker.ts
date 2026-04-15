import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L10 — Circuit Breaker — Halt Automático por Variação Extrema
 *
 * Delegado de T-004 — esta camada verifica e integra o circuit breaker
 * no pipeline L1→L10, garantindo a posição correta (após L9_DailyVolTarget).
 *
 * Comportamento:
 *   variacao_acumulada = |candidatePrice − closePrice| / closePrice
 *   se variacao >= 8%: isHalted = true, halt de ~5min (150 ticks × 2s)
 *
 * Posicionamento no pipeline:
 *   - L10 é invocado APÓS L1..L9 somarem seus deltas e L8 aplicar velocity cap.
 *   - `checkTrigger(candidatePrice, state)` verifica o preço candidato FINAL.
 *   - Se triggered: PriceCalculator retorna currentPrice (sem mudança) + halted=true.
 *   - Guard no início do pipeline (state.isPaused) é SEPARADO deste trigger.
 *
 * Invariante: halt suspende L1–L9 no próximo tick (via state.isPaused check).
 *
 * Integração:
 *   variacao >= 8% daily → isHalted=true → halt de 5min → retoma automaticamente.
 *   MarketEngine gerencia o timer de retomada (150 ticks × TICK_INTERVAL_MS).
 */

const CIRCUIT_BREAKER_THRESHOLD = 0.08   // 8% de variação acumulada no dia
const HALT_DURATION_TICKS       = 150    // ~5 minutos (150 ticks × 2s)

export interface CircuitBreakerResult extends LayerResult {
  triggered: boolean
  haltTicks?: number
}

export class L10_CircuitBreaker implements QuantLayer {
  name = 'L10_CircuitBreaker'

  /**
   * applyLayer: implementação QuantLayer padrão.
   * Em modo de pipeline sequencial, use `checkTrigger` para verificar o
   * preço candidato final antes de commitá-lo.
   */
  applyLayer(state: AssetState, _params: ClusterParams, _noise: number): CircuitBreakerResult {
    return this.checkTrigger(state.currentPrice, state)
  }

  /**
   * Verifica se o preço candidato (pós-L1..L9) dispara o circuit breaker.
   * Compara com closePrice (âncora do dia).
   *
   * @param candidatePrice Preço final antes de ser commitado ao estado
   * @param state          Estado atual do ativo
   */
  checkTrigger(candidatePrice: number, state: AssetState): CircuitBreakerResult {
    if (state.closePrice === 0) {
      return { layer: this.name, deltaPrice: 0, triggered: false }
    }

    const changePercent = Math.abs(
      (candidatePrice - state.closePrice) / state.closePrice
    )

    if (changePercent >= CIRCUIT_BREAKER_THRESHOLD) {
      // Halt: MarketEngine trata o estado isPaused e o timer de retomada
      state.isPaused = true

      return {
        layer: this.name,
        deltaPrice: 0,
        triggered: true,
        haltTicks: HALT_DURATION_TICKS,
        metadata: {
          changePercent,
          threshold: CIRCUIT_BREAKER_THRESHOLD,
          haltDurationTicks: HALT_DURATION_TICKS,
        },
      }
    }

    return {
      layer: this.name,
      deltaPrice: 0,
      triggered: false,
      metadata: { changePercent, threshold: CIRCUIT_BREAKER_THRESHOLD },
    }
  }
}
