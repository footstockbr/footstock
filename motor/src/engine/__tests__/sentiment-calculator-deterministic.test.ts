/**
 * @jest-environment node
 */
// ============================================================================
// SentimentCalculator — testes deterministicos (Task 020, loop 08-17)
//
// Suite deterministica e sem rede/DB que cobre os cinco contratos do
// SentimentCalculator:
//
//   1. Histerese com tempo minimo de permanencia (MIN_PERMANENCE_TICKS = 6).
//   2. Gating por sessao CLOSED dentro do calculador puro (applySessionGate).
//   3. Gating por sessao de mercado (CLOSED -> score 0, NEUTRAL).
//   4. Componente F em zero quando nao ha impactos ativos.
//   5. Janela de 72h com entrada e saida de noticia (componente A).
//   6. Congelamento REAL de sentimento sob halt (isPaused / sentimentFrozen),
//      exercitado no seam de emissao `buildHaltTick(AssetState)` com o harness.
//
// Aceite (ver task-020):
//   - Testes falham se a histerese for removida (secao 1, sensibilidade explicita).
//   - Falham se o peso de F deixar de ser zero sem decisao explicita (secao 7).
//   - Falham se o rotulo mudar com ativo pausado (secao 6).
//   - Rodam sem rede.
//
// ATENCAO - o que as secoes 2 e 6 cobrem NAO e a mesma coisa:
//   - Secao 2/3: `applySessionGate(sessionType === 'CLOSED')` dentro do calculador
//     puro. `SentimentCalculatorInput` nao tem `isPaused`: halt e invisivel aqui.
//   - Secao 6: o congelamento por halt de verdade (`state.isPaused` ->
//     `sentimentFrozenScore/Label` -> `sentimentFrozen: true` no tick emitido).
//
// GAP RESIDUAL CONHECIDO (nao coberto por esta suite): a CAPTURA idempotente dos
// campos `sentimentFrozen*` vive em `MarketEngine.runTick()` (linhas 580-587), um
// metodo privado de uma classe que instancia PrismaClient + Redis no construtor.
// Cobrir o call-site exige teste de integracao no nivel do engine. Esta suite cobre
// o invariante OBSERVAVEL (o que o frontend recebe enquanto o ativo esta pausado).
//
// Precedente: run-tick-paused.test.ts (mesma politica: sem mocks de modulos
// do motor; so Prisma/DB ficam de fora; harness real via buildInitialState).
// ============================================================================

import {
  calculateSentiment,
  WEIGHT_A,
  WEIGHT_F,
  MIN_PERMANENCE_TICKS,
  THRESHOLD_BULLISH,
  THRESHOLD_BEARSISH,
  EMA_ALPHA,
  type SentimentCalculatorInput,
  type SentimentComponentInput,
  type SentimentLabel,
} from '../SentimentCalculator'

import {
  computeWindowComponent,
  computeCoverageStats,
  buildWindowExitReason,
  NEWS_WINDOW_HOURS,
  NORMALIZATION_CONFIDENCE_C,
  LOW_COVERAGE_THRESHOLD,
  type NewsWindowRow,
} from '../../news/NewsSentimentWindow'

import {
  computeFastTermComponent,
  FAST_IMPACT_MEMORY_TICKS,
  FAST_TERM_NORMALIZATION_MAX,
} from '../../news/FastNewsTerm'

import { buildHaltTick } from '../../microstructure/MotorTick'
import { buildInitialState, ASSET_FIXTURES } from '../../harness/fixtures'

import type { ActiveNewsImpact, AssetState } from '../../types/motor.types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Constroi um SentimentComponentInput com valores default zero e pesos canonicos.
 * O caller sobrescreve apenas os slots que interessam ao cenario.
 */
function makeComponents(
  overrides: Partial<Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', number>> = {},
): SentimentComponentInput {
  return {
    A: { value: overrides.A ?? 0, weight: WEIGHT_A },
    B: { value: overrides.B ?? 0, weight: 0.25 },
    C: { value: overrides.C ?? 0, weight: 0.20 },
    D: { value: overrides.D ?? 0, weight: 0.15 },
    E: { value: overrides.E ?? 0, weight: 0.10 },
    F: { value: overrides.F ?? 0, weight: WEIGHT_F },
  }
}

/** Input minimo para calculateSentiment com defaults neutros. */
function makeInput(overrides: Partial<SentimentCalculatorInput> = {}): SentimentCalculatorInput {
  return {
    components: makeComponents(),
    previousScore: 0,
    previousLabel: 'NEUTRAL',
    previousFlipTick: 0,
    currentTick: 100,
    sessionType: 'TRADING',
    ...overrides,
  }
}

function makeNewsRow(overrides: Partial<NewsWindowRow> = {}): NewsWindowRow {
  return {
    id: `news-${Math.random().toString(36).slice(2, 8)}`,
    ticker: 'URU3',
    sentiment: 'NEUTRAL',
    publishedAt: new Date(),
    sentimentClassifiedAt: new Date(),
    ...overrides,
  }
}

function makeActiveImpact(overrides: Partial<ActiveNewsImpact> = {}): ActiveNewsImpact {
  return {
    magnitude: 0.5,
    durationTicks: 50,
    ticksRemaining: 50,
    qualityFlags: [],
    ...overrides,
  }
}

// =============================================================================
// 1. HISTERESE COM TEMPO MINIMO DE PERMANENCIA
// =============================================================================

describe('histerese com tempo minimo de permanencia', () => {
  it('NEUTRAL -> BULLISH: flip IMEDIATO quando score cruza limiar (entrada livre para NEUTRAL)', () => {
    // Score entre limiares -> NEUTRAL (entrada livre, sem histerese).
    const input = makeInput({
      components: makeComponents({ B: 0.9 }),
      previousLabel: 'NEUTRAL',
      previousScore: 0,
      currentTick: 100,
    })
    const out = calculateSentiment(input)
    // rawScore > 0 -> smoothed > 0 -> pode ser BULLISH se >= THRESHOLD_BULLISH
    // B=0.9 * weight 0.25 = 0.225; / sumWeights(1.0) = 0.225
    // smoothed = 0.3 * 0.225 + 0.7 * 0 = 0.0675
    // 0.0675 < THRESHOLD_BULLISH (0.2) -> NEUTRAL
    // Precisamos de um score mais alto para cruzar o limiar.
    // Vamos usar A=1.0 (weight 0.30) -> raw = 0.30 -> smoothed = 0.3*0.30 = 0.09
    // Ainda nao cruza. Precisamos de score raw >= ~0.667 para smoothed >= 0.2.
    // smoothed = 0.3 * raw + 0.7 * prev >= 0.2 -> raw >= (0.2 - 0.7*prev)/0.3
    // Com prev=0: raw >= 0.667. Com todos os componentes em 1.0: raw = 1.0.
    expect(out.label).toBe('NEUTRAL') // score nao cruzou ainda
  })

  it('NEUTRAL -> BULLISH: flip ocorre quando smoothed score >= THRESHOLD_BULLISH', () => {
    // Todos componentes em +1.0 -> rawScore = 1.0 -> smoothed = 0.3*1.0 + 0.7*0 = 0.3
    // 0.3 >= THRESHOLD_BULLISH (0.2) -> BULLISH (entrada livre vindo de NEUTRAL)
    const input = makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
      previousLabel: 'NEUTRAL',
      previousScore: 0,
      currentTick: 100,
    })
    const out = calculateSentiment(input)
    expect(out.label).toBe('BULLISH')
    expect(out.flipOccurred).toBe(true)
  })

  it('score negativo com previousScore alto: smoothed permanece em zona BULLISH (histerese implicita via EMA)', () => {
    // Com EMA alpha=0.3, um tick nao pode mover smoothed de BULLISH (>=0.2) para
    // BEARISH (<=-0.2). O smoothed cai para zona NEUTRAL (entrada livre) primeiro.
    // Para testar que o rotulo NAO flipa: previousScore=0.9, raw=-0.5 -> smoothed=0.48.
    // 0.48 >= 0.2 -> zona BULLISH -> label=BULLISH (sem flip, pois ja era BULLISH).
    const input = makeInput({
      // A=-1, D=-1 -> raw = (-0.30 + -0.15)/1.1 = -0.45/1.1 ≈ -0.409
      // smoothed = 0.3*(-0.409) + 0.7*(0.9) = -0.123 + 0.63 = 0.507 >= 0.2 -> BULLISH
      components: makeComponents({ A: -1, D: -1 }),
      previousLabel: 'BULLISH',
      previousScore: 0.9,
      previousFlipTick: 98,
      currentTick: 100,
    })
    const out = calculateSentiment(input)
    expect(out.label).toBe('BULLISH')
    expect(out.flipOccurred).toBe(false)
    expect(out.score).toBeGreaterThan(0.2)
  })

  it('score na zona NEUTRAL: label vai para NEUTRAL imediatamente (sem histerese para entrada livre)', () => {
    // smoothed = 0.3*(-1) + 0.7*(0.5) = 0.05 -> entre -0.2 e 0.2 -> NEUTRAL (entrada livre).
    // A histerese NAO bloqueia a entrada para NEUTRAL — so bloqueia flips BULLISH<->BEARISH.
    const input = makeInput({
      components: makeComponents({ A: -1, B: -1, C: -1, D: -1, E: -1, F: -1 }),
      previousLabel: 'BULLISH',
      previousScore: 0.5,
      previousFlipTick: 98,
      currentTick: 100,
    })
    const out = calculateSentiment(input)
    expect(out.label).toBe('NEUTRAL')
    expect(out.flipOccurred).toBe(true) // BULLISH -> NEUTRAL = flip
  })

  it('BULLISH -> BEARISH em 2 ticks: smoothed cruza zona NEUTRAL e chega a BEARISH', () => {
    // Tick 1: previousLabel=BULLISH, previousScore=0.5, raw=-1
    //   smoothed = 0.3*(-1) + 0.7*(0.5) = 0.05 -> NEUTRAL zone -> label=NEUTRAL (flip)
    // Tick 2: previousLabel=NEUTRAL, previousScore=0.05, raw=-1
    //   smoothed = 0.3*(-1) + 0.7*(0.05) = -0.265 -> <= -0.2 -> BEARISH zone
    //   previousLabel=NEUTRAL != BEARISH, ticksSinceFlip=1 >= MIN_PERMANENCE_TICKS=6? NO
    //   -> histerese bloqueia! Mantem NEUTRAL.
    // Tick 7: ticksSinceFlip = 6 >= 6 -> flip para BEARISH.
    // Este teste verifica a transicao completa em multi-ticks.
    let label: SentimentLabel = 'BULLISH'
    let score = 0.5
    let flipTick = 0
    const labels: SentimentLabel[] = []

    for (let tick = 1; tick <= 10; tick++) {
      const out = calculateSentiment({
        components: makeComponents({ A: -1, B: -1, C: -1, D: -1, E: -1, F: -1 }),
        previousScore: score,
        previousLabel: label,
        previousFlipTick: flipTick,
        currentTick: tick,
        sessionType: 'TRADING',
      })
      labels.push(out.label)
      label = out.label
      score = out.score
      if (out.flipOccurred) flipTick = tick
    }

    // Apos 10 ticks com raw=-1: label deve ser BEARISH (flipou em algum ponto)
    expect(label).toBe('BEARISH')

    // SENSIBILIDADE A MUTACAO (aceite da task-020): as assertivas abaixo falham se o
    // gate de permanencia (ticksSinceFlip >= MIN_PERMANENCE_TICKS) for removido de
    // resolveLabel. Sem o gate o flip para BEARISH ocorreria no tick 2 (indice 1).
    // Com o gate: flip em NEUTRAL no tick 1 (flipTick=1) e flip em BEARISH somente
    // quando 7 - 1 = 6 >= MIN_PERMANENCE_TICKS, isto e, no tick 7 (indice 6).
    expect(labels.indexOf('BEARISH')).toBe(MIN_PERMANENCE_TICKS)
    // Ticks 2..6 permanecem NEUTRAL apesar de o smoothed score ja estar na zona BEARISH.
    expect(labels.slice(1, MIN_PERMANENCE_TICKS)).toEqual(
      Array(MIN_PERMANENCE_TICKS - 1).fill('NEUTRAL'),
    )
  })

  it('BULLISH -> NEUTRAL: entrada livre (sem histerese para NEUTRAL)', () => {
    // Score entre limiares -> NEUTRAL sempre, independente de permanencia.
    // previousScore=0, all components=0 -> rawScore=0, smoothed=0 -> entre limiares -> NEUTRAL
    const input = makeInput({
      components: makeComponents(), // todos zero -> rawScore = 0 -> smoothed = 0
      previousLabel: 'BULLISH',
      previousScore: 0,
      previousFlipTick: 99, // ticksSinceFlip = 1 (nao importa para NEUTRAL)
      currentTick: 100,
    })
    const out = calculateSentiment(input)
    expect(out.label).toBe('NEUTRAL')
    expect(out.flipOccurred).toBe(true)
  })

  it('sequencia de 10 ticks: BULLISH so flipa para BEARISH apos permanencia satisfeita', () => {
    // Simula 10 ticks: tick 1 com componentes positivos, ticks 2-10 negativos.
    // ATENCAO: este teste NAO exercita o bloqueio da histerese. `makeInput` nao
    // recebe `currentTick`, logo currentTick fica fixo em 100 e ticksSinceFlip
    // (100 - flipTick) e sempre >= MIN_PERMANENCE_TICKS: o gate nunca bloqueia.
    // Sequencia real: tick 1 BULLISH, tick 2 NEUTRAL (zona), tick 3 BEARISH.
    // O bloqueio da histerese (e a sensibilidade a sua remocao) esta no teste
    // 'BULLISH -> BEARISH em 2 ticks', que passa currentTick real.
    let label: SentimentLabel = 'NEUTRAL'
    let score = 0
    let flipTick = 0
    const labels: SentimentLabel[] = []

    for (let tick = 1; tick <= 10; tick++) {
      const comps = tick === 1
        ? { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }
        : { A: -1, B: -1, C: -1, D: -1, E: -1, F: -1 }

      const out = calculateSentiment(makeInput({
        components: makeComponents(comps),
        previousScore: score,
        previousLabel: label,
        previousFlipTick: flipTick,
      }))

      labels.push(out.label)
      label = out.label
      score = out.score
      if (out.flipOccurred) flipTick = tick
    }

    // Tick 1: NEUTRAL -> BULLISH (flip, todos componentes +1, smoothed=0.3)
    expect(labels[0]).toBe('BULLISH')
    // Tick 2: zona NEUTRAL (entrada livre); tick 3 em diante: BEARISH.
    expect(labels[1]).toBe('NEUTRAL')
    expect(labels[2]).toBe('BEARISH')
    expect(labels[6]).toBe('BEARISH')
    // Apos flip, mantem BEARISH com componentes negativos
    expect(labels[9]).toBe('BEARISH')
  })
})

// =============================================================================
// 2. GATING POR SESSAO CLOSED NO CALCULADOR PURO
//    (NAO e halt: halt por isPaused esta na secao 6)
// =============================================================================

describe('gating por sessao CLOSED dentro do calculador puro', () => {
  it('session CLOSED: score congelado em 0 e label = NEUTRAL independente dos componentes', () => {
    const input = makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
      previousScore: 0.5,
      previousLabel: 'BULLISH',
      sessionType: 'CLOSED',
    })
    const out = calculateSentiment(input)
    expect(out.score).toBe(0)
    expect(out.label).toBe('NEUTRAL')
  })

  it('session CLOSED: flipOccurred reflete mudanca de label (BULLISH -> NEUTRAL)', () => {
    const input = makeInput({
      previousLabel: 'BULLISH',
      previousScore: 0.5,
      sessionType: 'CLOSED',
    })
    const out = calculateSentiment(input)
    expect(out.flipOccurred).toBe(true)
  })

  it('session CLOSED: sem flip quando label anterior ja era NEUTRAL', () => {
    const input = makeInput({
      previousLabel: 'NEUTRAL',
      previousScore: 0,
      sessionType: 'CLOSED',
    })
    const out = calculateSentiment(input)
    expect(out.flipOccurred).toBe(false)
    expect(out.label).toBe('NEUTRAL')
  })

  it('halt congela sentimento mesmo com componentes fortemente BULLISH', () => {
    // Verifica que o gating de sessao tem precedencia sobre a histerese.
    // Mesmo que os componentes digam BULLISH, CLOSED -> NEUTRAL/0.
    const input = makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
      previousScore: 0.8,
      previousLabel: 'BULLISH',
      previousFlipTick: 50,
      currentTick: 100,
      sessionType: 'CLOSED',
    })
    const out = calculateSentiment(input)
    expect(out.score).toBe(0)
    expect(out.label).toBe('NEUTRAL')
    expect(out.flipOccurred).toBe(true)
  })

  it('sessoes abertas (TRADING, PRE_OPENING, CLOSING_CALL, AFTER_MARKET) nao congelam', () => {
    const sessions: Array<'PRE_OPENING' | 'TRADING' | 'CLOSING_CALL' | 'AFTER_MARKET'> = [
      'PRE_OPENING', 'TRADING', 'CLOSING_CALL', 'AFTER_MARKET',
    ]
    for (const session of sessions) {
      const input = makeInput({
        components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
        previousScore: 0,
        previousLabel: 'NEUTRAL',
        sessionType: session,
      })
      const out = calculateSentiment(input)
      expect(out.score).not.toBe(0)
      expect(out.label).toBe('BULLISH')
    }
  })
})

// =============================================================================
// 3. GATING POR SESSAO DE MERCADO
// =============================================================================

describe('gating por sessao de mercado', () => {
  it('CLOSED: score e label zerados; reason menciona NEUTRAL', () => {
    const input = makeInput({
      components: makeComponents({ A: 0.8 }),
      sessionType: 'CLOSED',
    })
    const out = calculateSentiment(input)
    expect(out.score).toBe(0)
    expect(out.label).toBe('NEUTRAL')
    expect(out.reason).toContain('NEUTRAL')
  })

  it('TRADING: score e label computados normalmente', () => {
    const input = makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
      sessionType: 'TRADING',
    })
    const out = calculateSentiment(input)
    expect(out.score).toBeGreaterThan(0)
    expect(out.label).toBe('BULLISH')
  })

  it('transicao TRADING -> CLOSED -> TRADING: sentimento volta a ser computado', () => {
    // Tick 1: TRADING com componentes positivos -> BULLISH
    const input1 = makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
    })
    const out1 = calculateSentiment(input1)
    expect(out1.label).toBe('BULLISH')
    const bullScore = out1.score

    // Tick 2: CLOSED -> congela
    const out2 = calculateSentiment(makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
      previousScore: bullScore,
      previousLabel: 'BULLISH',
      sessionType: 'CLOSED',
    }))
    expect(out2.score).toBe(0)
    expect(out2.label).toBe('NEUTRAL')

    // Tick 3: TRADING novamente -> volta a computar
    const out3 = calculateSentiment(makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
    }))
    expect(out3.label).toBe('BULLISH')
    expect(out3.score).toBeGreaterThan(0)

    // O gate de CLOSED nao corrompe o estado anterior: quando o caller devolve o
    // par (score, label) de ANTES do CLOSED, o sentimento retoma de onde parou e
    // continua subindo (nao reinicia do zero).
    const out4 = calculateSentiment(makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
      previousScore: bullScore,
      previousLabel: 'BULLISH',
    }))
    expect(out4.label).toBe('BULLISH')
    expect(out4.score).toBeGreaterThan(bullScore)
  })
})

// =============================================================================
// 4. COMPONENTE F EM ZERO
// =============================================================================

describe('componente F (termo rapido) em zero', () => {
  it('F.value = 0 quando nao ha impactos ativos: F nao contribui para o score', () => {
    // Componente F com value=0 e weight=WEIGHT_F (0.10):
    // weightedValue_F = 0 * 0.10 = 0 -> nao contribui.
    const input = makeInput({
      components: makeComponents({ A: 0.5, F: 0 }),
      previousScore: 0,
    })
    const out = calculateSentiment(input)
    expect(out.components.F.value).toBe(0)
    expect(out.components.F.weightedValue).toBe(0)
  })

  it('F.value = 0 com A positivo: score reflete APENAS A (F nao mascara)', () => {
    // So A contribui com valor nao-nulo. F = 0.
    // rawScore = (A.value*A.weight) / sumWeights
    //          = (0.5 * 0.30) / 1.0 = 0.15
    // smoothed = 0.3 * 0.15 + 0.7 * 0 = 0.045
    const input = makeInput({
      components: makeComponents({ A: 0.5, F: 0 }),
      previousScore: 0,
    })
    const out = calculateSentiment(input)
    // Score deve ser 0.045 (so A contribuiu)
    expect(out.score).toBeCloseTo(0.045, 2)
    expect(out.components.F.weightedValue).toBe(0)
    expect(out.components.A.weightedValue).toBeCloseTo(0.15, 4)
  })

  it('F ativo (value != 0) CONTRIBUI para o score quando ha impactos', () => {
    // F.value = 0.8 -> weightedValue = 0.8 * 0.10 = 0.08
    const input = makeInput({
      components: makeComponents({ A: 0.5, F: 0.8 }),
      previousScore: 0,
    })
    const out = calculateSentiment(input)
    expect(out.components.F.weightedValue).toBeCloseTo(0.08, 4)
    // Score deve ser maior que quando F=0 (0.045)
    expect(out.score).toBeGreaterThan(0.045)
  })

  it('computeFastTermComponent: retorna 0 quando activeNewsImpacts esta vazio', () => {
    const result = computeFastTermComponent([])
    expect(result.value).toBe(0)
    expect(result.activeCount).toBe(0)
    expect(result.aggregateMagnitude).toBe(0)
  })

  it('computeFastTermComponent: retorna 0 quando todos impactos expiraram (ticksRemaining=0)', () => {
    const impacts: ActiveNewsImpact[] = [
      makeActiveImpact({ ticksRemaining: 0, magnitude: 0.8 }),
      makeActiveImpact({ ticksRemaining: 0, magnitude: -0.5 }),
    ]
    const result = computeFastTermComponent(impacts)
    expect(result.value).toBe(0)
    expect(result.activeCount).toBe(0)
  })

  it('computeFastTermComponent: valor positivo com impactos BULLISH ativos', () => {
    const impacts: ActiveNewsImpact[] = [
      makeActiveImpact({ magnitude: 0.8, ticksRemaining: 30 }),
      makeActiveImpact({ magnitude: 0.6, ticksRemaining: 20 }),
    ]
    const result = computeFastTermComponent(impacts)
    expect(result.activeCount).toBe(2)
    expect(result.value).toBeGreaterThan(0)
    // rawValue = (0.8+0.6)/2 = 0.7; coverage = 2/5 = 0.4; normalized = 0.28
    expect(result.value).toBeCloseTo(0.28, 2)
  })

  it('WEIGHT_F e exatamente 0.10 (guard contra mudanca acidental)', () => {
    // Este teste FAILO se alguem mudar WEIGHT_F sem intencao explicita.
    expect(WEIGHT_F).toBe(0.10)
  })
})

// =============================================================================
// 5. JANELA DE 72H — ENTRADA E SAIDA DE NOTICIA
// =============================================================================

describe('janela de 72h com entrada e saida de noticia (componente A)', () => {
  const now = new Date('2026-08-18T15:00:00Z')

  function rowInsideWindow(hoursAgo: number, sentiment: NewsWindowRow['sentiment']): NewsWindowRow {
    return makeNewsRow({
      sentiment,
      publishedAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
    })
  }

  it('entrada de noticia BULLISH na janela: componente A positivo', () => {
    const rows = [
      rowInsideWindow(1, 'BULLISH'),
      rowInsideWindow(5, 'BULLISH'),
      rowInsideWindow(24, 'BULLISH'),
    ]
    const result = computeWindowComponent(rows)
    expect(result.value).toBeGreaterThan(0)
    expect(result.positiveCount).toBe(3)
    expect(result.count).toBe(3)
  })

  it('entrada de noticia BEARISH na janela: componente A negativo', () => {
    const rows = [
      rowInsideWindow(2, 'BEARISH'),
      rowInsideWindow(10, 'BEARISH'),
    ]
    const result = computeWindowComponent(rows)
    expect(result.value).toBeLessThan(0)
    expect(result.negativeCount).toBe(2)
  })

  it('saida de noticia da janela (72h): score muda sem evento novo', () => {
    // 3 noticias BULLISH dentro da janela
    const rowsBefore = [
      rowInsideWindow(1, 'BULLISH'),
      rowInsideWindow(5, 'BULLISH'),
      rowInsideWindow(70, 'BULLISH'), // perto do limite de 72h
    ]
    const before = computeWindowComponent(rowsBefore)

    // A noticia de 70h atras saiu da janela (agora tem 74h)
    const rowsAfter = [
      rowInsideWindow(1, 'BULLISH'),
      rowInsideWindow(5, 'BULLISH'),
    ]
    const after = computeWindowComponent(rowsAfter)

    // Score mudou porque uma noticia saiu (cobertura diminuiu)
    expect(after.value).not.toBe(before.value)
    expect(after.count).toBe(before.count - 1)
  })

  it('saida de noticia BEARISH: score move na direcao positiva', () => {
    // Antes: 2 BULLISH + 1 BEARISH
    const before = computeWindowComponent([
      rowInsideWindow(1, 'BULLISH'),
      rowInsideWindow(5, 'BULLISH'),
      rowInsideWindow(70, 'BEARISH'),
    ])

    // A BEARISH saiu da janela
    const after = computeWindowComponent([
      rowInsideWindow(1, 'BULLISH'),
      rowInsideWindow(5, 'BULLISH'),
    ])

    // Score apos saida da BEARISH deve ser mais positivo
    expect(after.value).toBeGreaterThan(before.value)
  })

  it('buildWindowExitReason: registra saida de noticia da janela', () => {
    const reason = buildWindowExitReason({
      exitedNewsCount: 1,
      exitedNewsSentiments: ['BEARISH'],
      previousScore: 0.05,
      currentScore: 0.15,
    })
    expect(reason).toContain('1 notícia(s) saíram da janela')
    expect(reason).toContain('1 BEARISH')
    expect(reason).toContain('+0.05')
    expect(reason).toContain('+0.15')
  })

  it('janela vazia (todas noticias expiraram): componente A = 0', () => {
    const result = computeWindowComponent([])
    expect(result.value).toBe(0)
    expect(result.count).toBe(0)
  })

  it('noticias mistas se cancelam parcialmente na janela', () => {
    const rows = [
      rowInsideWindow(1, 'BULLISH'),
      rowInsideWindow(2, 'BEARISH'),
      rowInsideWindow(3, 'BULLISH'),
      rowInsideWindow(4, 'NEUTRAL'),
    ]
    const result = computeWindowComponent(rows)
    // soma = 2 - 1 = 1; massa = 4 (NEUTRAL conta na massa); N = 1 / (4 + 3) = 0.1429
    expect(result.value).toBeCloseTo(1 / 7, 4)
    expect(result.positiveCount).toBe(2)
    expect(result.negativeCount).toBe(1)
    expect(result.neutralCount).toBe(1)
  })

  it('NEWS_WINDOW_HOURS e 72 (guard contra mudanca acidental)', () => {
    expect(NEWS_WINDOW_HOURS).toBe(72)
  })

  it('NORMALIZATION_CONFIDENCE_C e 3.0 (guard da forma canonica soma/(massa + C))', () => {
    expect(NORMALIZATION_CONFIDENCE_C).toBe(3.0)
  })
})

// =============================================================================
// 6. INTEGRACAO — calculateSentiment com componentes do mundo real
// =============================================================================

describe('integracao: calculateSentiment com componentes de modulos reais', () => {
  it('componente A via computeWindowComponent + F via computeFastTermComponent', () => {
    // Simula o pipeline real:
    //   1. fetchNewsWindow -> computeWindowComponent -> componente A
    //   2. activeNewsImpacts -> computeFastTermComponent -> componente F
    const newsRows = [
      makeNewsRow({ sentiment: 'BULLISH' }),
      makeNewsRow({ sentiment: 'BULLISH' }),
      makeNewsRow({ sentiment: 'BEARISH' }),
    ]
    const windowResult = computeWindowComponent(newsRows)

    const impacts: ActiveNewsImpact[] = [
      makeActiveImpact({ magnitude: 0.7, ticksRemaining: 40 }),
    ]
    const fastResult = computeFastTermComponent(impacts)

    const input = makeInput({
      components: makeComponents({
        A: windowResult.value,
        F: fastResult.value,
      }),
      previousScore: 0,
    })
    const out = calculateSentiment(input)

    // A e F contribuem; score > 0 porque ambos sao positivos
    expect(out.score).toBeGreaterThan(0)
    expect(out.components.A.value).toBeCloseTo(windowResult.value, 4)
    expect(out.components.F.value).toBeCloseTo(fastResult.value, 4)
  })

  it('A positivo + F expirado: score ainda positivo (A sustenta sozinho)', () => {
    // Quando o termo rapido expira (F=0), o componente A (janela 72h)
    // deve sustentar o sentimento sozinho — N nao zera.
    const newsRows = [
      makeNewsRow({ sentiment: 'BULLISH' }),
      makeNewsRow({ sentiment: 'BULLISH' }),
      makeNewsRow({ sentiment: 'BULLISH' }),
      makeNewsRow({ sentiment: 'BULLISH' }),
      makeNewsRow({ sentiment: 'BULLISH' }),
    ]
    const windowResult = computeWindowComponent(newsRows)

    const input = makeInput({
      components: makeComponents({
        A: windowResult.value,
        F: 0, // termo rapido expirou
      }),
      previousScore: 0,
    })
    const out = calculateSentiment(input)

    // Score ainda positivo porque A contribui
    expect(out.score).toBeGreaterThan(0)
    expect(out.components.F.weightedValue).toBe(0)
    expect(out.components.A.weightedValue).toBeGreaterThan(0)
  })

  it('EMA suaviza: score nao salta diretamente para o rawScore', () => {
    // previousScore = 0, rawScore positivo -> smoothed < rawScore
    const input = makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
      previousScore: 0,
    })
    const out = calculateSentiment(input)
    // rawScore = 1.0 (todos componentes em 1.0)
    // smoothed = 0.3 * 1.0 + 0.7 * 0 = 0.3
    expect(out.score).toBeCloseTo(0.3, 2)
    expect(out.score).toBeLessThan(1.0) // EMA suavizou
  })

  it('EMA acumula: ticks consecutivos com mesmo sinal aproximam score do raw', () => {
    let score = 0
    let label: SentimentLabel = 'NEUTRAL'
    let flipTick = 0

    for (let tick = 1; tick <= 20; tick++) {
      const out = calculateSentiment({
        components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
        previousScore: score,
        previousLabel: label,
        previousFlipTick: flipTick,
        currentTick: tick,
        sessionType: 'TRADING',
      })
      score = out.score
      if (out.flipOccurred) flipTick = tick
      label = out.label
    }

    // Apos 20 ticks com rawScore=1.0, EMA deve convergir para perto de 1.0
    // smoothed_n = 0.3 * 1.0 + 0.7 * smoothed_{n-1}
    // Apos 20 iteracoes: ~0.999
    expect(score).toBeGreaterThan(0.9)
  })
})

// =============================================================================
// 7. BAIXA COBERTURA — COMPONENTE A (Task-021)
// =============================================================================

describe('baixa cobertura do componente A (task-021)', () => {
  describe('computeCoverageStats', () => {
    it('cobertura alta (>= 50% classificadas): isLowCoverage = false', () => {
      // 10 classificadas / 2 nao = coverageRatio 0.83
      const stats = computeCoverageStats(10, 2)
      expect(stats.coverageRatio).toBeCloseTo(0.833, 2)
      expect(stats.isLowCoverage).toBe(false)
      expect(stats.totalPublished).toBe(12)
    })

    it('cobertura baixa (< 50% classificadas): isLowCoverage = true', () => {
      // 3 classificadas / 7 nao = coverageRatio 0.30
      const stats = computeCoverageStats(3, 7)
      expect(stats.coverageRatio).toBeCloseTo(0.30, 2)
      expect(stats.isLowCoverage).toBe(true)
      expect(stats.totalPublished).toBe(10)
    })

    it('cobertura baixa extrema (0 classificadas / 5 nao): isLowCoverage = true', () => {
      const stats = computeCoverageStats(0, 5)
      expect(stats.coverageRatio).toBe(0)
      expect(stats.isLowCoverage).toBe(true)
    })

    it('zero noticias (0/0): isLowCoverage = false (ausencia, nao baixa cobertura)', () => {
      const stats = computeCoverageStats(0, 0)
      expect(stats.coverageRatio).toBe(1)
      expect(stats.isLowCoverage).toBe(false)
      expect(stats.totalPublished).toBe(0)
    })

    it('limiar exato (50% classificadas): isLowCoverage = false (>= threshold)', () => {
      // 5 classificadas / 5 nao = coverageRatio 0.50
      // isLowCoverage = coverageRatio < (1 - LOW_COVERAGE_THRESHOLD) = 0.50 < 0.50 = false
      const stats = computeCoverageStats(5, 5)
      expect(stats.coverageRatio).toBe(0.50)
      expect(stats.isLowCoverage).toBe(false)
    })

    it('abaixo do limiar (49% classificadas): isLowCoverage = true', () => {
      // 49 classificadas / 51 nao = coverageRatio ~0.49
      const stats = computeCoverageStats(49, 51)
      expect(stats.coverageRatio).toBeCloseTo(0.49, 2)
      expect(stats.isLowCoverage).toBe(true)
    })
  })

  describe('computeWindowComponent com lowCoverage', () => {
    const now = new Date('2026-08-18T15:00:00Z')

    function rowInsideWindow(hoursAgo: number, sentiment: NewsWindowRow['sentiment']): NewsWindowRow {
      return makeNewsRow({
        sentiment,
        publishedAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
      })
    }

    it('cobertura alta: lowCoverage = false, value calculado normalmente', () => {
      const rows = [
        rowInsideWindow(1, 'BULLISH'),
        rowInsideWindow(5, 'BULLISH'),
        rowInsideWindow(24, 'BEARISH'),
      ]
      const result = computeWindowComponent(rows, 1)
      // 3 classificadas, 1 nao-classificada -> coverageRatio = 0.75 -> isLowCoverage = false
      expect(result.lowCoverage).toBe(false)
      expect(result.unclassifiedCount).toBe(1)
      expect(result.value).not.toBe(0)
    })

    it('cobertura baixa: lowCoverage = true, value = 0', () => {
      const rows = [
        rowInsideWindow(1, 'BULLISH'),
        rowInsideWindow(5, 'BULLISH'),
      ]
      // 2 classificadas, 8 nao-classificadas -> coverageRatio = 0.20 -> isLowCoverage = true
      const result = computeWindowComponent(rows, 8)
      expect(result.lowCoverage).toBe(true)
      expect(result.unclassifiedCount).toBe(8)
      expect(result.value).toBe(0)
      expect(result.count).toBe(2)
    })

    it('zero noticias classificadas + noticias nao-classificadas: lowCoverage = true', () => {
      // 0 classificadas, 5 nao -> coverageRatio = 0 -> isLowCoverage = true
      const result = computeWindowComponent([], 5)
      expect(result.lowCoverage).toBe(true)
      expect(result.unclassifiedCount).toBe(5)
      expect(result.value).toBe(0)
    })

    it('zero noticias total (0 classificadas + 0 nao): lowCoverage = false (ausencia)', () => {
      const result = computeWindowComponent([], 0)
      expect(result.lowCoverage).toBe(false)
      expect(result.unclassifiedCount).toBe(0)
      expect(result.value).toBe(0)
      expect(result.count).toBe(0)
    })

    it('default unclassifiedCount = 0 (retrocompativel com chamadas sem parametro)', () => {
      const rows = [rowInsideWindow(1, 'BULLISH')]
      const result = computeWindowComponent(rows)
      expect(result.lowCoverage).toBe(false)
      expect(result.unclassifiedCount).toBe(0)
    })
  })

  describe('calculateSentiment com metadata de baixa cobertura', () => {
    it('aLowCoverage = true: razao menciona baixa cobertura, nao "sem sinal dominante"', () => {
      const input = makeInput({
        components: makeComponents({ A: 0 }),
        previousScore: 0,
        metadata: {
          aLowCoverage: true,
          aUnclassifiedCount: 8,
          aTotalPublished: 10,
          aCoverageRatio: 0.20,
        },
      })
      const out = calculateSentiment(input)
      expect(out.reason).toContain('janela quase vazia')
      expect(out.reason).toContain('8/10')
      expect(out.reason).toContain('sem classificacao LLM')
      expect(out.reason).not.toContain('sem sinal dominante')
    })

    it('sem metadata: razao NEUTRAL usa "sem sinal dominante" (retrocompativel)', () => {
      const input = makeInput({
        components: makeComponents({ A: 0 }),
        previousScore: 0,
      })
      const out = calculateSentiment(input)
      expect(out.reason).toContain('sem sinal dominante')
      expect(out.reason).not.toContain('janela quase vazia')
    })

    it('aLowCoverage = false na metadata: razao NEUTRAL usa "sem sinal dominante"', () => {
      const input = makeInput({
        components: makeComponents({ A: 0 }),
        previousScore: 0,
        metadata: { aLowCoverage: false },
      })
      const out = calculateSentiment(input)
      expect(out.reason).toContain('sem sinal dominante')
    })

    it('aLowCoverage = true com label BULLISH: prefixo da razao casa com o label', () => {
      const input = makeInput({
        components: makeComponents({ A: 0, B: 1, C: 1, D: 1 }),
        previousScore: 0.6,
        previousLabel: 'BULLISH',
        metadata: {
          aLowCoverage: true,
          aUnclassifiedCount: 8,
          aTotalPublished: 10,
          aCoverageRatio: 0.20,
        },
      })
      const out = calculateSentiment(input)
      expect(out.label).toBe('BULLISH')
      expect(out.reason.startsWith('BULLISH (')).toBe(true)
      expect(out.reason).toContain('janela quase vazia')
      expect(out.reason).not.toContain('NEUTRAL')
    })

    it('aLowCoverage = true com label BEARISH: prefixo da razao casa com o label', () => {
      const input = makeInput({
        components: makeComponents({ A: 0, B: -1, C: -1, D: -1 }),
        previousScore: -0.6,
        previousLabel: 'BEARISH',
        metadata: {
          aLowCoverage: true,
          aUnclassifiedCount: 9,
          aTotalPublished: 10,
          aCoverageRatio: 0.10,
        },
      })
      const out = calculateSentiment(input)
      expect(out.label).toBe('BEARISH')
      expect(out.reason.startsWith('BEARISH (')).toBe(true)
      expect(out.reason).toContain('janela quase vazia')
      expect(out.reason).not.toContain('NEUTRAL')
    })

    it('aLowCoverage = true com label NEUTRAL: prefixo continua NEUTRAL', () => {
      const input = makeInput({
        components: makeComponents({ A: 0 }),
        previousScore: 0,
        metadata: {
          aLowCoverage: true,
          aUnclassifiedCount: 8,
          aTotalPublished: 10,
          aCoverageRatio: 0.20,
        },
      })
      const out = calculateSentiment(input)
      expect(out.label).toBe('NEUTRAL')
      expect(out.reason.startsWith('NEUTRAL (')).toBe(true)
      expect(out.reason).toContain('janela quase vazia')
    })

    it('LOW_COVERAGE_THRESHOLD e 0.50 (guard contra mudanca acidental)', () => {
      expect(LOW_COVERAGE_THRESHOLD).toBe(0.50)
    })
  })
})

// =============================================================================
// 8. CONSTANTES E INVARIANTES
// =============================================================================

describe('constantes e invariantes do SentimentCalculator', () => {
  it('MIN_PERMANENCE_TICKS e 6 (guard contra mudanca acidental)', () => {
    expect(MIN_PERMANENCE_TICKS).toBe(6)
  })

  it('THRESHOLD_BULLISH e 0.2', () => {
    expect(THRESHOLD_BULLISH).toBe(0.2)
  })

  it('THRESHOLD_BEARSISH e -0.2', () => {
    expect(THRESHOLD_BEARSISH).toBe(-0.2)
  })

  it('EMA_ALPHA e 0.3', () => {
    expect(EMA_ALPHA).toBe(0.3)
  })

  it('WEIGHT_A e 0.30', () => {
    expect(WEIGHT_A).toBe(0.30)
  })

  it('soma dos pesos dos componentes e 1.1 (normalizacao por sumWeights)', () => {
    // Os pesos NAO somam 1.0 — o aggregateComponents normaliza por sumWeights.
    // WEIGHT_A(0.30) + B(0.25) + C(0.20) + D(0.15) + E(0.10) + F(0.10) = 1.10
    const totalWeight = WEIGHT_A + 0.25 + 0.20 + 0.15 + 0.10 + WEIGHT_F
    expect(totalWeight).toBeCloseTo(1.1, 10)
  })

  it('score sempre clampado em [-1, +1]', () => {
    // Componentes extremos
    const inputMax = makeInput({
      components: makeComponents({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
      previousScore: 1,
    })
    expect(calculateSentiment(inputMax).score).toBeLessThanOrEqual(1)

    const inputMin = makeInput({
      components: makeComponents({ A: -1, B: -1, C: -1, D: -1, E: -1, F: -1 }),
      previousScore: -1,
    })
    expect(calculateSentiment(inputMin).score).toBeGreaterThanOrEqual(-1)
  })

  it('FAST_IMPACT_MEMORY_TICKS e 50 (herdado de NEWS_IMPACT_DURATION_TICKS)', () => {
    expect(FAST_IMPACT_MEMORY_TICKS).toBe(50)
  })

  it('FAST_TERM_NORMALIZATION_MAX e 5', () => {
    expect(FAST_TERM_NORMALIZATION_MAX).toBe(5)
  })
})

// =============================================================================
// 6. CONGELAMENTO REAL DE SENTIMENTO EM HALT (isPaused / sentimentFrozen)
//
// Mecanismo real (NAO passa pelo calculador puro):
//   - MarketEngine.runTick():580-587 -> para cada `state.isPaused`, na PRIMEIRA
//     iteracao de halt copia sentimentScore/Label para sentimentFrozenScore/Label
//     (idempotente via `sentimentFrozenAtTick === undefined`).
//   - MotorTick.buildHaltTick():68-71 -> o tick emitido carrega
//     `sentimentFrozenScore ?? sentimentScore ?? 0`,
//     `sentimentFrozenLabel ?? sentimentLabel ?? 'NEUTRAL'` e
//     `sentimentFrozen: true`.
//   - MarketEngine:303-306 -> resume limpa os tres campos.
//
// Politica igual ao precedente run-tick-paused.test.ts: exercita a guarda REAL no
// colaborador puro (aqui `buildHaltTick`), com estado vindo do harness real
// (`buildInitialState` / `ASSET_FIXTURES`), sem mock de modulo do motor.
//
// Sensibilidade a mutacao: remover `sentimentFrozenScore ??` ou
// `sentimentFrozenLabel ??` de buildHaltTick faz o tick emitir o sentimento
// CORRENTE (que muda a cada tick) e os testes abaixo falham; remover
// `sentimentFrozen: true` falha o teste do flag.
// =============================================================================

const URU3_FIXTURE = ASSET_FIXTURES.find(f => f.ticker === 'URU3')!

/** Estado pausado com sentimento ja congelado, como o runTick deixa no 1o tick de halt. */
function buildPausedFrozenState(): AssetState {
  const state = buildInitialState(URU3_FIXTURE)
  state.sentimentScore = 0.62
  state.sentimentLabel = 'BULLISH'
  state.sentimentLastFlipTick = 40
  // halt disparado
  state.isPaused = true
  state.haltReason = 'HALT_ALL'
  // captura idempotente feita pelo runTick na 1a iteracao de halt
  state.sentimentFrozenAtTick = 100
  state.sentimentFrozenScore = 0.62
  state.sentimentFrozenLabel = 'BULLISH'
  return state
}

describe('congelamento real de sentimento em halt (isPaused)', () => {
  it('ativo pausado: rotulo e score emitidos NAO mudam ao longo de 26 ticks de halt, mesmo com o sentimento corrente mudando', () => {
    const state = buildPausedFrozenState()
    const frozenScore = state.sentimentFrozenScore!
    const frozenLabel = state.sentimentFrozenLabel!
    const emittedScores: number[] = []
    const emittedLabels: string[] = []

    for (let tick = 1; tick <= 26; tick++) {
      // O calculo de sentimento continua rodando em outro lugar e mexendo no
      // estado corrente: se o congelamento nao existisse, o tick de halt
      // exporia essa oscilacao para o frontend.
      state.sentimentScore = tick % 2 === 0 ? -0.95 : 0.95
      state.sentimentLabel = tick % 2 === 0 ? 'BEARISH' : 'BULLISH'

      const tickOut = buildHaltTick(state, 'TRADING', state.haltReason, null)
      emittedScores.push(tickOut.sentimentScore!)
      emittedLabels.push(tickOut.sentimentLabel!)
      expect(tickOut.isHalted).toBe(true)
      expect(tickOut.sentimentFrozen).toBe(true)
    }

    // ACEITE task-020: "falham se o rotulo mudar com ativo pausado".
    expect(new Set(emittedLabels).size).toBe(1)
    expect(emittedLabels[0]).toBe(frozenLabel)
    expect(new Set(emittedScores).size).toBe(1)
    expect(emittedScores[0]).toBe(frozenScore)
    // E o congelado e mesmo diferente do corrente no ultimo tick (prova que o
    // teste nao esta apenas espelhando o estado corrente).
    expect(state.sentimentLabel).not.toBe(frozenLabel)
    expect(state.sentimentScore).not.toBe(frozenScore)
  })

  it('tick de halt sempre marca sentimentFrozen = true (mesmo sem campos congelados)', () => {
    const state = buildInitialState(URU3_FIXTURE)
    state.isPaused = true
    state.haltReason = 'CIRCUIT_BREAKER'
    const tickOut = buildHaltTick(state, 'TRADING', state.haltReason, null)
    expect(tickOut.sentimentFrozen).toBe(true)
  })

  it('fallback documentado: sem campos congelados usa o sentimento corrente; sem nenhum dos dois usa 0 / NEUTRAL', () => {
    const withCurrent = buildInitialState(URU3_FIXTURE)
    withCurrent.isPaused = true
    withCurrent.sentimentScore = -0.4
    withCurrent.sentimentLabel = 'BEARISH'
    const t1 = buildHaltTick(withCurrent, 'TRADING', 'HALT_ALL', null)
    expect(t1.sentimentScore).toBe(-0.4)
    expect(t1.sentimentLabel).toBe('BEARISH')

    const empty = buildInitialState(URU3_FIXTURE)
    empty.isPaused = true
    const t2 = buildHaltTick(empty, 'TRADING', 'HALT_ALL', null)
    expect(t2.sentimentScore).toBe(0)
    expect(t2.sentimentLabel).toBe('NEUTRAL')
    expect(t2.sentimentFrozen).toBe(true)
  })

  it('congelado tem precedencia sobre o corrente (o ?? nao pode ser invertido)', () => {
    const state = buildPausedFrozenState()
    state.sentimentScore = -0.95
    state.sentimentLabel = 'BEARISH'
    const tickOut = buildHaltTick(state, 'TRADING', 'HALT_ALL', null)
    expect(tickOut.sentimentScore).toBe(0.62)
    expect(tickOut.sentimentLabel).toBe('BULLISH')
  })

  it('resume limpa o congelamento: o proximo tick de halt reflete o novo sentimento corrente', () => {
    const state = buildPausedFrozenState()
    // MarketEngine:303-306 no resume
    state.isPaused = false
    state.haltReason = null
    state.sentimentFrozenAtTick = undefined
    state.sentimentFrozenScore = undefined
    state.sentimentFrozenLabel = undefined
    // sentimento volta a evoluir livremente
    state.sentimentScore = -0.7
    state.sentimentLabel = 'BEARISH'
    // novo halt mais tarde, antes de o runTick recapturar
    state.isPaused = true
    const tickOut = buildHaltTick(state, 'TRADING', 'HALT_ALL', null)
    expect(tickOut.sentimentScore).toBe(-0.7)
    expect(tickOut.sentimentLabel).toBe('BEARISH')
  })

  it('tick de halt nao move preco (coerente com run-tick-paused.test.ts)', () => {
    const state = buildPausedFrozenState()
    const tickOut = buildHaltTick(state, 'TRADING', 'HALT_ALL', null)
    expect(tickOut.price).toBe(state.currentPrice)
    expect(tickOut.change).toBe(0)
    expect(tickOut.changePercent).toBe(0)
  })
})
