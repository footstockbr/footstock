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
 *   MarketEngine gerencia o timer de retomada via PAUSE_RESUME_MS (5min absoluto, independente de TICK_INTERVAL_MS).
 */

const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 0.08   // 8% de variação acumulada no dia
const HALT_DURATION_TICKS       = 150    // ~5 minutos (150 ticks × 2s)

/**
 * Threshold elevado enquanto há notícia ativa (state.newsImpactTicks > 0).
 *
 * Motivação: com magnitude típica das notícias × SPOT_CAP=2.5%/tick de L7, o
 * preço cruza o threshold canônico de 8% em ~10 ticks (fim da fase spread),
 * disparando CB exatamente enquanto a notícia ainda deveria estar absorvendo.
 * O halt de 5min interrompe a curva de 50 ticks, e nem o front-end nem o usuário
 * veem a absorção. Durante notícia ativa toleramos até NEWS_CB_THRESHOLD; o CB
 * canônico volta no tick em que `newsImpactTicks === 0`.
 *
 * Ver L7_PressureQueue para a curva e news-inject-contract.ts para a duração.
 */
const NEWS_CB_THRESHOLD = 0.20            // 20% durante notícia (em vez de 8%)

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
  applyLayer(state: AssetState, params: ClusterParams, _noise: number): CircuitBreakerResult {
    return this.checkTrigger(state.currentPrice, state, params)
  }

  /**
   * Verifica se o preço candidato (pós-L1..L9) dispara o circuit breaker.
   * Compara com closePrice (âncora do dia).
   *
   * @param candidatePrice Preço final antes de ser commitado ao estado
   * @param state          Estado atual do ativo
   */
  checkTrigger(candidatePrice: number, state: AssetState, params?: ClusterParams): CircuitBreakerResult {
    if (state.closePrice === 0) {
      return { layer: this.name, deltaPrice: 0, triggered: false }
    }

    const changePercent = Math.abs(
      (candidatePrice - state.closePrice) / state.closePrice
    )

    // newsActive exige newsImpact !== 0 também: protege contra ticks "fantasma"
    // (newsImpact=0 sem decrement em L7 manteria o flag preso eternamente).
    const newsActive = state.newsImpact !== 0 && state.newsImpactTicks > 0
    const threshold = newsActive
      ? NEWS_CB_THRESHOLD
      : (params?.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD)

    if (changePercent >= threshold) {
      // Halt: MarketEngine trata o estado isPaused e o timer de retomada
      state.isPaused = true

      return {
        layer: this.name,
        deltaPrice: 0,
        triggered: true,
        haltTicks: HALT_DURATION_TICKS,
        metadata: {
          changePercent,
          threshold,
          newsActive: newsActive ? 1 : 0,
          haltDurationTicks: HALT_DURATION_TICKS,
        },
      }
    }

    return {
      layer: this.name,
      deltaPrice: 0,
      triggered: false,
      metadata: { changePercent, threshold, newsActive: newsActive ? 1 : 0 },
    }
  }
}
