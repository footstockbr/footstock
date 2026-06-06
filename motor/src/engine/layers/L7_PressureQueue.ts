import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'
import { NEWS_IMPACT_DURATION_TICKS } from '../../contracts/news-inject-contract'

/**
 * L7 - Pressure Queue (News Impact Absorption)
 * INTAKE canônico:
 * - PRESSURE_SPREAD_TICKS = 10 (distribui impacto em ordens sintéticas)
 * - ABSORPTION_TICKS = 40 (ajuste gradual do fair value, ~80s)
 * - Spot cap: ±2.5% de movimento instantâneo por notícia
 *
 * Invariante: PRESSURE_SPREAD_TICKS + ABSORPTION_TICKS === NEWS_IMPACT_DURATION_TICKS.
 * Inicialização de `state.newsImpactTicks` deve usar a constante do contract.
 */
const DEFAULT_PRESSURE_SPREAD_TICKS = 10
const DEFAULT_ABSORPTION_TICKS = 40
const DEFAULT_SPOT_CAP = 0.025 // ±2.5% max instantâneo

if (DEFAULT_PRESSURE_SPREAD_TICKS + DEFAULT_ABSORPTION_TICKS !== NEWS_IMPACT_DURATION_TICKS) {
  throw new Error(
    `[L7_PressureQueue] invariante violado: DEFAULT_PRESSURE_SPREAD_TICKS + DEFAULT_ABSORPTION_TICKS (` +
      `${DEFAULT_PRESSURE_SPREAD_TICKS + DEFAULT_ABSORPTION_TICKS}) !== NEWS_IMPACT_DURATION_TICKS (${NEWS_IMPACT_DURATION_TICKS}). ` +
      `Atualize a constante do contract para manter sincronia.`,
  )
}

export class L7_PressureQueue implements QuantLayer {
  name = 'L7_PressureQueue'

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    state.activeNewsImpacts = (state.activeNewsImpacts ?? []).filter((news) => news.ticksRemaining > 0)
    const activeNews = state.activeNewsImpacts[0]
    const activeMagnitude = activeNews?.magnitude ?? state.newsImpact
    const activeTicks = activeNews?.ticksRemaining ?? state.newsImpactTicks

    if (activeMagnitude === 0 || activeTicks <= 0) {
      // Sane-default: se ticks expiraram, zera magnitude também — garante que o
      // flag "notícia ativa" (consumido por L10) não fique preso caso a magnitude
      // tenha sido sanitizada externamente.
      if (state.newsImpactTicks <= 0 && state.newsImpact !== 0) state.newsImpact = 0
      if (state.activeNewsImpacts.length === 0) {
        state.newsImpact = 0
        state.newsImpactTicks = 0
      }
      return { layer: this.name, deltaPrice: 0 }
    }

    // Fase 1: Spread (primeiros PRESSURE_SPREAD_TICKS ticks) — impacto rápido
    // Fase 2: Absorption (ABSORPTION_TICKS ticks) — decaimento gradual
    const pressureSpreadTicks = params.pressureSpreadTicks ?? DEFAULT_PRESSURE_SPREAD_TICKS
    const absorptionTicks = params.pressureAbsorptionTicks ?? DEFAULT_ABSORPTION_TICKS
    const spotCap = params.pressureSpotCap ?? DEFAULT_SPOT_CAP
    const totalTicks = pressureSpreadTicks + absorptionTicks
    const ticksElapsed = totalTicks - activeTicks

    let decayFactor: number
    let phaseLabel: 'spread' | 'absorption'
    if (ticksElapsed < pressureSpreadTicks) {
      // Fase spread: impacto forte, decai de 1.0 a ~0.5
      decayFactor = 1 - (ticksElapsed / pressureSpreadTicks) * 0.5
      phaseLabel = 'spread'
    } else {
      // Fase absorption: decai de 0.5 a 0
      const absorptionProgress = (ticksElapsed - pressureSpreadTicks) / absorptionTicks
      decayFactor = 0.5 * (1 - absorptionProgress)
      phaseLabel = 'absorption'
    }

    let deltaPrice = activeMagnitude * decayFactor * state.currentPrice

    // Spot cap: limitar impacto instantâneo a ±2.5%
    const maxDelta = spotCap * state.currentPrice
    deltaPrice = Math.max(-maxDelta, Math.min(maxDelta, deltaPrice))

    // Decrementar ticks restantes
    if (activeNews) {
      activeNews.ticksRemaining -= 1
      state.activeNewsImpacts = state.activeNewsImpacts.filter((news) => news.ticksRemaining > 0)
      const aggregateMagnitude = state.activeNewsImpacts.reduce((sum, news) => sum + news.magnitude, 0)
      state.newsImpact = Math.max(-1, Math.min(1, aggregateMagnitude || 0))
      state.newsImpactTicks = state.activeNewsImpacts[0]?.ticksRemaining ?? 0
    } else {
      state.newsImpactTicks -= 1
      if (state.newsImpactTicks === 0) state.newsImpact = 0
    }

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        newsId: activeNews?.newsId ?? '',
        title: activeNews?.title ?? '',
        source: activeNews?.source ?? '',
        impactCategory: activeNews?.impactCategory ?? '',
        sentiment: typeof activeNews?.sentiment === 'number' ? activeNews.sentiment : 0,
        newsImpact: state.newsImpact,
        ticksRemaining: state.newsImpactTicks,
        magnitudeApplied: deltaPrice,
        decayFactor,
        pressureSpreadTicks,
        absorptionTicks,
        spotCap,
        phase: phaseLabel === 'spread' ? 0 : 1, // 0=spread, 1=absorption
        phaseLabel,
      },
    }
  }
}
