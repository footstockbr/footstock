/**
 * @jest-environment node
 */
// ============================================================================
// MarketEngine.runTick — imobilidade do preco sob pausa (Task 008, loop
// 06-29-motor-toggles-nao-param, cenarios 3 e 4).
//
// runTick() delega o congelamento do preco a DUAS guardas reais que compartilham
// o MESMO predicado `state.isPaused`:
//   1. MarketEngine.runTick() linha 567-568: `for (... of assetStates) { if
//      (state.isPaused) continue }` — ativo pausado nao entra no pipeline.
//   2. PriceCalculator.calculate() linha 118-120: short-circuit que retorna
//      `{ newPrice: currentPrice, layerResults: [], agentImpact: 0, halted: true }`
//      sem rodar L1-L10, nudge (L7.5), agente nem correlacao.
//
// O preco so pode mudar passando por PriceCalculator.calculate(). Este teste
// exercita a guarda real (#2) com noise e agentImpact NAO-nulos para provar que
// nenhum colaborador (nudge/agente/correlacao) move o preco enquanto pausado, e
// que o movimento volta apos resume-all (isPaused=false). Sem mocks: PriceCalculator
// e fixtures sao codigo real do motor.
// ============================================================================
import { PriceCalculator } from '../PriceCalculator'
import { buildInitialState, ASSET_FIXTURES } from '../../harness/fixtures'
import { getClusterParams } from '../../microstructure/clusters'

// Gerador de ruido deterministico N(0,1)-ish (LCG + Box-Muller) — evita
// Math.random para reprodutibilidade do baseline (mesma politica de fixtures.ts).
function deterministicNoise(seed: number): () => number {
  let s = seed >>> 0
  const next = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0
    return (s & 0xffffffff) / 0x100000000
  }
  return (): number => {
    const u1 = Math.max(next(), 1e-12)
    const u2 = next()
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }
}

const URU3 = ASSET_FIXTURES.find(f => f.ticker === 'URU3')! // A_TOP liquido ~R$100
const ABT3 = ASSET_FIXTURES.find(f => f.ticker === 'ABT3')! // B_ILLIQ ~R$2,65 (nudge dispararia)

describe('runTick sob pausa — imobilidade do preco (cenario 3)', () => {
  test('A_TOP: 151 ticks consecutivos com isPaused=true produzem delta de preco == 0', () => {
    const calculator = new PriceCalculator()
    const state = buildInitialState(URU3)
    const params = getClusterParams(state.cluster)
    state.isPaused = true
    state.haltReason = 'HALT_ALL'
    const initialPrice = state.currentPrice
    const noise = deterministicNoise(1337)

    for (let tick = 1; tick <= 151; tick++) {
      // agentImpact NAO-nulo (+2%) e noise NAO-nulo: se a guarda falhasse, o
      // preco mudaria. A guarda real curto-circuita antes de qualquer camada.
      const result = calculator.calculate(state, params, noise(), undefined, 0.02)
      expect(result.newPrice).toBe(initialPrice)
      expect(result.halted).toBe(true)
      expect(result.agentImpact).toBe(0)        // agente neutralizado
      expect(result.layerResults).toHaveLength(0) // nenhuma camada (nudge/corr incluidos) rodou
    }

    // Pos-condicao agregada do cenario 3: delta total == 0 apos 151 ticks.
    expect(state.currentPrice).toBe(initialPrice)
  })

  test('B_ILLIQ (nudge dispararia): pausa neutraliza o L7.5 Nudge por 151 ticks', () => {
    const calculator = new PriceCalculator()
    const state = buildInitialState(ABT3)
    const params = getClusterParams(state.cluster)
    state.isPaused = true
    state.haltReason = 'HALT_ALL'
    const initialPrice = state.currentPrice
    const noise = deterministicNoise(4242)

    for (let tick = 1; tick <= 151; tick++) {
      const result = calculator.calculate(state, params, noise(), undefined, 0.02)
      expect(result.newPrice).toBe(initialPrice)
      // Se o nudge (que opera em ativos iliquidos) tivesse escapado da guarda,
      // layerResults conteria uma entrada 'L7_5_Nudge'. Pausa => vazio.
      expect(result.layerResults).toHaveLength(0)
    }
    expect(state.currentPrice).toBe(initialPrice)
  })
})

describe('runTick apos resume-all — retomada dos ticks (cenario 4)', () => {
  test('A_TOP: apos resume-all (isPaused=false), ao menos um tick produz delta != 0', () => {
    const calculator = new PriceCalculator()
    const state = buildInitialState(URU3)
    const params = getClusterParams(state.cluster)

    // 1) Pausa: confirma congelamento.
    state.isPaused = true
    const frozenPrice = state.currentPrice
    const frozen = calculator.calculate(state, params, 1.5, undefined, 0.02)
    expect(frozen.newPrice).toBe(frozenPrice)
    expect(frozen.halted).toBe(true)

    // 2) resume-all: efeito documentado de MarketEngine.resumeAll() — isPaused=false,
    //    haltReason=null. O preco volta a variar.
    state.isPaused = false
    state.haltReason = null

    const noise = deterministicNoise(2026)
    let moved = false
    let last = state.currentPrice
    for (let tick = 1; tick <= 30 && !moved; tick++) {
      const result = calculator.calculate(state, params, noise(), undefined, 0.02)
      expect(result.halted).toBe(false)
      // Mirror do runTick: o engine atribui newPrice ao estado entre ticks.
      state.currentPrice = result.newPrice
      if (result.newPrice !== last) moved = true
      last = result.newPrice
    }

    expect(moved).toBe(true)
    expect(state.isPaused).toBe(false)
  })
})
