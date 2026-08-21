// ============================================================================
// FootStock Motor — FastNewsTerm
// Termo rapido intradia do componente N (sentimento).
//
// Task-008 do loop 08-17-foot-stock-sentimento-vivo-motor-ativos:
// usa `state.activeNewsImpacts[]` (alimentado por `MarketEngine.injectNewsImpact`)
// como termo rapido de sentimento, mantendo os dois horizontes explicitamente
// separados:
//
//   - Termo rapido (ESTE MODULO): impacto em memoria, vive 50 ticks (~8 min).
//     Derivado de `activeNewsImpacts[]` com `ticksRemaining > 0`.
//     Constante: FAST_IMPACT_MEMORY_TICKS = 50.
//
//   - Termo de janela (NewsSentimentWindow.ts): consulta DB, janela fixa de 72h.
//     Constante: NEWS_WINDOW_HOURS = 72.
//
// Os dois SOMAM no calculo de N (SentimentCalculator), nenhum substitui o outro.
// Quando o impacto em memoria expira (todos ticksRemaining == 0), N nao zera
// porque o termo de janela (componente A) permanece independente.
//
// Este modulo exporta:
//   1. `FAST_IMPACT_MEMORY_TICKS` — constante nomeada do horizonte rapido.
//   2. `computeFastTermComponent()` — funcao PURA de calculo do termo rapido
//      a partir de `activeNewsImpacts[]` (testavel sem engine/DB).
// ============================================================================

import type { ActiveNewsImpact } from '../types/motor.types'
import { NEWS_IMPACT_DURATION_TICKS } from '../contracts/news-inject-contract'

// ─── Constantes do horizonte rapido ──────────────────────────────────────────

/**
 * Horizonte do termo rapido: duracao do impacto em memoria (ticks).
 *
 * Vale `NEWS_IMPACT_DURATION_TICKS` (50 ticks, ~8 min a 1 tick/10s).
 * Declarado como alias nomeado para rastreabilidade no contexto de sentimento:
 * o contract define o valor canonico; este modulo o referencia explicitamente
 * para que os dois horizontes (rapido e janela) aparecam com nomes proprios
 * nos componentes gravados do SentimentCalculator.
 */
export const FAST_IMPACT_MEMORY_TICKS = NEWS_IMPACT_DURATION_TICKS

/**
 * Contador maximo de impactos ativos para normalizacao do termo rapido.
 *
 * Usado como denominador fixo na normalizacao, de modo que a saturacao da fila
 * (max 5 impactos ativos em `activeNewsImpacts`) nao distorca o valor.
 * Valor 5 = lotacao maxima da fila; com count=5 e magnitudes no range [-1,1],
 * o valor normalizado fica em [-1, +1] sem clamp adicional.
 */
export const FAST_TERM_NORMALIZATION_MAX = 5

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Resultado do calculo do termo rapido intradia. */
export interface FastTermResult {
  /** Valor normalizado do termo rapido em [-1, +1]. */
  value: number
  /** Contagem de impactos ativos (ticksRemaining > 0). */
  activeCount: number
  /** Soma das magnitudes ativas (antes da normalizacao). */
  aggregateMagnitude: number
  /** Ticks restantes do impacto mais recente (0 quando nenhum ativo). */
  maxTicksRemaining: number
}

// ─── Funcao PURA de calculo do termo rapido ──────────────────────────────────

/**
 * Calcula o valor do termo rapido intradia a partir de `activeNewsImpacts[]`.
 * Funcao PURA — sem I/O, testavel sem engine nem DB.
 *
 * Formula:
 *   1. Filtra impactos com `ticksRemaining > 0` (ativos).
 *   2. aggregateMagnitude = soma das magnitudes ativas (cada uma em [-1, 1]).
 *   3. rawValue = aggregateMagnitude / max(activeCount, 1)  (media direcional).
 *   4. normalizedValue = rawValue * (activeCount / FAST_TERM_NORMALIZATION_MAX)
 *      (penaliza fila parcial sem satura).
 *   5. Clamped to [-1, +1].
 *
 * Quando nenhum impacto esta ativo (todos expiraram), retorna value=0.
 * O termo de janela (componente A, 72h) permanece independente e N nao zera.
 *
 * A separacao entre os dois horizontes e garantida por:
 *   - Este modulo so le `activeNewsImpacts` (memoria, 50 ticks).
 *   - NewsSentimentWindow so le o DB (janela, 72h).
 *   - SentimentCalculator compoe os dois como componentes separados (F e A).
 */
export function computeFastTermComponent(
  activeNewsImpacts: ActiveNewsImpact[],
): FastTermResult {
  const active = activeNewsImpacts.filter((news) => news.ticksRemaining > 0)
  const activeCount = active.length

  if (activeCount === 0) {
    return { value: 0, activeCount: 0, aggregateMagnitude: 0, maxTicksRemaining: 0 }
  }

  const aggregateMagnitude = active.reduce((sum, news) => sum + news.magnitude, 0)
  const maxTicksRemaining = Math.max(...active.map((news) => news.ticksRemaining))

  // Media direcional: direction em [-1, +1]
  const rawValue = aggregateMagnitude / activeCount

  // Penaliza fila parcial: cobertura em [0, 1]
  const coverageRatio = Math.min(activeCount / FAST_TERM_NORMALIZATION_MAX, 1)
  const normalizedValue = rawValue * coverageRatio

  const value = Math.max(-1, Math.min(1, normalizedValue))

  return { value, activeCount, aggregateMagnitude, maxTicksRemaining }
}
