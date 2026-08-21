// ============================================================================
// FootStock Motor — SentimentCalculator
// Modulo PURO de calculo de sentimento do ativo. Sem I/O (Prisma, Redis, fetch,
// fs, etc.). Recebe estado + entradas dos componentes e devolve score continuo
// em [-1, +1], rotulo discreto, razao textual e componentes decompostos.
// Mesma entrada -> mesma saida (pureza referencial).
// ============================================================================

import type { SessionType } from '../types/motor.types'

// ─── Types ───────────────────────────────────────────────────────────────

export type SentimentLabel = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

export interface SentimentComponentSlot {
  value: number
  weight: number
}

export interface SentimentComponentInput {
  A: SentimentComponentSlot
  B: SentimentComponentSlot
  C: SentimentComponentSlot
  D: SentimentComponentSlot
  E: SentimentComponentSlot
  F: SentimentComponentSlot
}

export interface SentimentCalculatorInput {
  components: SentimentComponentInput
  previousScore: number
  previousLabel: SentimentLabel
  previousFlipTick: number
  currentTick: number
  sessionType: SessionType
  /**
   * Task-021: metadados opcionais dos componentes (ex.: baixa cobertura).
   * Quando component A está em baixa cobertura (>= 50% das notícias publicadas
   * na janela sem classificação LLM), o caller seta `aLowCoverage: true`.
   * A razão textual diferencia "janela quase vazia por baixa cobertura" de
   * "janela equilibrada / sem sinal dominante".
   */
  metadata?: {
    aLowCoverage?: boolean
    aUnclassifiedCount?: number
    aTotalPublished?: number
    aCoverageRatio?: number
  }
}

export interface SentimentDecomposedComponent {
  value: number
  weight: number
  weightedValue: number
}

export interface SentimentCalculatorOutput {
  score: number
  label: SentimentLabel
  reason: string
  components: Record<string, SentimentDecomposedComponent>
  flipOccurred: boolean
}

// ─── Parametros nomeados ─────────────────────────────────────────────────

/**
 * Peso do componente A (janela de notícias).
 *
 * Task-007: alimentado por `NewsSentimentWindow.computeWindowComponent()`.
 * Consulta findMany sobre `news` com is_published = true,
 * sentiment_classified_at IS NOT NULL, sentiment_degraded = false,
 * janela fixa de 72h, peso uniforme. Política mais estrita que o gate
 * editorial: exclui notícia bloqueada E publicada em modo degradado.
 *
 * Ver `motor/src/news/NewsSentimentWindow.ts`.
 */
export const WEIGHT_A = 0.30

/** Peso do componente B (ex.: book pressure). */
export const WEIGHT_B = 0.25

/** Peso do componente C (ex.: OFI). */
export const WEIGHT_C = 0.20

/** Peso do componente D (ex.: GARCH volatility). */
export const WEIGHT_D = 0.15

/** Peso do componente E (ex.: daily vol target). */
export const WEIGHT_E = 0.10

/**
 * Peso do componente F (termo rapido intradia).
 *
 * Task-008: alimentado por `computeFastTermComponent()` a partir de
 * `state.activeNewsImpacts[]` (impacto em memoria, 50 ticks / ~8 min).
 * Os dois horizontes de noticia aparecem separados nos componentes gravados:
 *   - Componente A (WEIGHT_A = 0.30): janela de noticias de 72h (DB).
 *   - Componente F (WEIGHT_F = 0.10): termo rapido intradia (memoria).
 * Ambos somam na composicao de N; nenhum substitui o outro. Quando o impacto
 * em memoria expira (todos ticksRemaining == 0), F vai a zero mas A permanece,
 * garantindo que N nao zera.
 *
 * Ver `motor/src/news/FastNewsTerm.ts` (horizonte rapido) e
 * `motor/src/news/NewsSentimentWindow.ts` (horizonte de janela).
 */
export const WEIGHT_F = 0.10

/** Fator de suavizacao EMA (Exponential Moving Average). 0 < alpha <= 1. */
export const EMA_ALPHA = 0.3

/** Limiar superior para rotulo BULLISH (score >= este valor). */
export const THRESHOLD_BULLISH = 0.2

/** Limiar inferior para rotulo BEARISH (score <= este valor). */
export const THRESHOLD_BEARSISH = -0.2

/** Tempo minimo de permanencia (em ticks) antes de permitir flip de rotulo. */
export const MIN_PERMANENCE_TICKS = 6

// ─── Helpers internos (puros) ────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * ST003 — Agregacao ponderada dos componentes.
 * Score raw = soma(weightedValue) / soma(weight).
 * Se soma dos pesos for 0, retorna 0 (evita divisao por zero).
 */
function aggregateComponents(
  components: SentimentComponentInput,
): { rawScore: number; decomposed: Record<string, SentimentDecomposedComponent> } {
  const slots: [string, SentimentComponentSlot][] = [
    ['A', components.A],
    ['B', components.B],
    ['C', components.C],
    ['D', components.D],
    ['E', components.E],
    ['F', components.F],
  ]

  let sumWeighted = 0
  let sumWeights = 0
  const decomposed: Record<string, SentimentDecomposedComponent> = {}

  for (const [key, slot] of slots) {
    const weightedValue = slot.value * slot.weight
    sumWeighted += weightedValue
    sumWeights += slot.weight
    decomposed[key] = {
      value: slot.value,
      weight: slot.weight,
      weightedValue,
    }
  }

  const rawScore = sumWeights === 0 ? 0 : sumWeighted / sumWeights
  return { rawScore: clamp(rawScore, -1, 1), decomposed }
}

/**
 * ST004 — Suavizacao EMA.
 * smoothed = EMA_ALPHA * rawScore + (1 - EMA_ALPHA) * previousScore
 */
function smoothScore(rawScore: number, previousScore: number): number {
  const smoothed = EMA_ALPHA * rawScore + (1 - EMA_ALPHA) * previousScore
  return clamp(smoothed, -1, 1)
}

/**
 * ST006 — Gating por sessao de mercado.
 * CLOSED -> score congelado em 0, label placeholder NEUTRAL.
 * Demais sessoes -> score e label inalterados.
 */
function applySessionGate(
  smoothedScore: number,
  sessionType: SessionType,
): { gatedScore: number; frozenForSession: boolean } {
  if (sessionType === 'CLOSED') {
    return { gatedScore: 0, frozenForSession: true }
  }
  return { gatedScore: smoothedScore, frozenForSession: false }
}

/**
 * ST005 — Histerese com limiares e tempo minimo de permanencia.
 *
 * Regras:
 * - Score entre limiares -> NEUTRAL (entrada livre, sem histerese para entrar).
 * - Score fora dos limiares -> flip so se (a) label anterior diferente E
 *   (b) ticks desde ultimo flip >= MIN_PERMANENCE_TICKS.
 * - Caso contrario -> mantem label anterior.
 */
function resolveLabel(
  gatedScore: number,
  previousLabel: SentimentLabel,
  previousFlipTick: number,
  currentTick: number,
): { label: SentimentLabel; flipOccurred: boolean } {
  const ticksSinceFlip = currentTick - previousFlipTick
  const permanenceSatisfied = ticksSinceFlip >= MIN_PERMANENCE_TICKS

  // Score entre limiares: NEUTRAL (entrada livre)
  if (gatedScore > THRESHOLD_BEARSISH && gatedScore < THRESHOLD_BULLISH) {
    const flip = previousLabel !== 'NEUTRAL'
    return { label: 'NEUTRAL', flipOccurred: flip }
  }

  // Score acima do limiar BULLISH
  if (gatedScore >= THRESHOLD_BULLISH) {
    if (previousLabel !== 'BULLISH' && permanenceSatisfied) {
      return { label: 'BULLISH', flipOccurred: true }
    }
    return { label: previousLabel, flipOccurred: false }
  }

  // Score abaixo do limiar BEARISH
  if (gatedScore <= THRESHOLD_BEARSISH) {
    if (previousLabel !== 'BEARISH' && permanenceSatisfied) {
      return { label: 'BEARISH', flipOccurred: true }
    }
    return { label: previousLabel, flipOccurred: false }
  }

  return { label: previousLabel, flipOccurred: false }
}

/**
 * ST007 — Razao textual deterministica.
 * Identifica: rotulo atual, score arredondado, componente dominante, flip.
 * Task-021: diferencia "janela quase vazia por baixa cobertura" de "sem sinal dominante".
 */
function buildReason(
  label: SentimentLabel,
  score: number,
  components: Record<string, SentimentDecomposedComponent>,
  flipOccurred: boolean,
  metadata?: SentimentCalculatorInput['metadata'],
): string {
  const scoreStr = score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2)

  // Task-021 (ST004): quando componente A está em baixa cobertura, a razão
  // deve mencionar isso explicitamente, diferenciando de "sem sinal dominante".
  if (metadata?.aLowCoverage) {
    const unclassified = metadata.aUnclassifiedCount ?? 0
    const total = metadata.aTotalPublished ?? 0
    const coveragePct = metadata.aCoverageRatio != null
      ? `${Math.round(metadata.aCoverageRatio * 100)}%`
      : 'insuficiente'
    // O prefixo usa o `label` calculado (nao um NEUTRAL fixo): a baixa cobertura
    // zera o componente A, mas os outros cinco componentes podem manter o score
    // fora da faixa neutra. Prefixo fixo produziria razao contradizendo o label.
    return `${label} (${scoreStr}) - janela quase vazia: ${unclassified}/${total} noticias sem classificacao LLM (cobertura ${coveragePct})`
  }

  if (label === 'NEUTRAL') {
    return `NEUTRAL (${scoreStr}) - sem sinal dominante`
  }

  // Componente dominante: maior |weightedValue|
  let dominantKey = ''
  let dominantAbsWeighted = -1
  for (const [key, comp] of Object.entries(components)) {
    const absW = Math.abs(comp.weightedValue)
    if (absW > dominantAbsWeighted) {
      dominantAbsWeighted = absW
      dominantKey = key
    }
  }

  const dominantComp = components[dominantKey]
  const dominantStr = dominantComp
    ? `componente ${dominantKey} dominou (${dominantComp.weightedValue >= 0 ? '+' : ''}${dominantComp.weightedValue.toFixed(2)})`
    : 'sem componente dominante'

  const flipStr = flipOccurred ? ', flip neste tick' : ''

  return `${label} (${scoreStr}) - ${dominantStr}${flipStr}`
}

// ─── Funcao principal exportada ──────────────────────────────────────────

/**
 * ST008 — Calculo de sentimento puro.
 *
 * Pipeline:
 * 1. Agregacao ponderada dos componentes -> rawScore
 * 2. Suavizacao EMA -> smoothed
 * 3. Gating por sessao (CLOSED -> 0) -> gatedScore
 * 4. Histerese com limiares + permanencia -> label
 * 5. Razao textual -> reason
 * 6. Retorna output completo
 */
export function calculateSentiment(
  input: SentimentCalculatorInput,
): SentimentCalculatorOutput {
  // 1. Agregacao
  const { rawScore, decomposed } = aggregateComponents(input.components)

  // 2. Suavizacao EMA
  const smoothed = smoothScore(rawScore, input.previousScore)

  // 3. Gating por sessao
  const { gatedScore, frozenForSession } = applySessionGate(smoothed, input.sessionType)

  // 4. Histerese (se congelado por sessao, label = NEUTRAL direto)
  let label: SentimentLabel
  let flipOccurred: boolean
  if (frozenForSession) {
    label = 'NEUTRAL'
    flipOccurred = input.previousLabel !== 'NEUTRAL'
  } else {
    const resolved = resolveLabel(
      gatedScore,
      input.previousLabel,
      input.previousFlipTick,
      input.currentTick,
    )
    label = resolved.label
    flipOccurred = resolved.flipOccurred
  }

  // 5. Razao textual (Task-021: metadata de baixa cobertura do componente A)
  const reason = buildReason(label, gatedScore, decomposed, flipOccurred, input.metadata)

  // 6. Output
  return {
    score: gatedScore,
    label,
    reason,
    components: decomposed,
    flipOccurred,
  }
}
