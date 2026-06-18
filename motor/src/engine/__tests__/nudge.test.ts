/**
 * @jest-environment node
 *
 * Porta do nudge artificial do legacy-new/FootStock-new2.jsx (decisao I7).
 * Cobre os 4 contratos canonicos da Task 8/009:
 *   (i)   149 ticks sem variacao -> nao aplica nudge.
 *   (ii)  150 ticks sem variacao -> aplica nudge de magnitude ±NUDGE_DELTA.
 *   (iii) Movimento real no tick X -> reset do contador.
 *   (iv)  Nudge respeita invariantes de L8 (velocity cap) e L10 (circuit breaker).
 */
import { PriceCalculator } from '../PriceCalculator'
import { NUDGE_TICKS, NUDGE_DELTA, classifyNudgeMove } from '../nudge-constants'
import type { AssetState, ClusterParams } from '../../types/motor.types'

// State minimo que mantem L1-L7 silenciosos (delta = 0) para isolar o nudge.
const flatState = (): AssetState => ({
  id: 'asset_nudge',
  ticker: 'NDG3',
  cluster: 'A_TOP',
  state: 'SP',
  currentPrice: 28.00,
  openPrice: 28.00,
  highPrice: 28.00,
  lowPrice: 28.00,
  closePrice: 28.00,
  fairValue: 28.00,   // fairValue == currentPrice -> direcao do nudge default = +1
  volume: 50000,
  variance: 0.0001,
  pendingBuyVolume: 0,
  pendingSellVolume: 0,
  isPaused: false,
  haltReason: null,
  haltResumeAt: null,
  newsImpact: 0,
  newsImpactTicks: 0,
  ofiState: 0,
  dailyVolAccum: 0,
  dailySigmaMultiplier: 1.0,
  volatilityMultiplier: 1.0,
  ticksSinceLastChange: 0,
})

const flatParams = (): ClusterParams => ({
  cluster: 'A_TOP',
  baseVolume: 50000,
  drift: 0.0,
  theta: 0.12,
  sigma: 0.0018,
  garchAlpha: 0.12,
  garchBeta: 0.85,
  lambdaKyle: 0.0001,
  spread: 0.0005,
  maxTickChange: 0.0035,
  ofiDecay: 0.91,
  alphaOfi: 0.0005,
})

describe('Minimum Activity Nudge (L7.5)', () => {
  let calc: PriceCalculator

  beforeEach(() => {
    calc = new PriceCalculator()
  })

  test('(i) 149 ticks sem variacao nao dispara nudge', () => {
    const state = flatState()
    const params = flatParams()

    for (let i = 0; i < NUDGE_TICKS - 1; i++) {
      const result = calc.calculate(state, params, 0)
      expect(result.halted).toBe(false)
      // Preco deve permanecer congelado (delta zero, sem nudge)
      expect(result.newPrice).toBeCloseTo(28.00, 4)
      state.currentPrice = result.newPrice
    }
    expect(state.ticksSinceLastChange).toBe(NUDGE_TICKS - 1)

    // Nenhum LayerResult tipo L7_5_Nudge ate aqui
    const lastResult = calc.calculate(state, params, 0)
    // Esse é o 150o tick consecutivo SEM variacao acumulada — deve disparar.
    // Mas o teste (i) cobre estritamente apos 149: o estado ANTES do 150o tem ticks=149.
    expect(lastResult.layerResults.some(r => r.layer === 'L7_5_Nudge')).toBe(true)
    expect(state.ticksSinceLastChange).toBe(0) // reset apos disparar
  })

  test('(ii) 150 ticks consecutivos disparam nudge de magnitude ±NUDGE_DELTA', () => {
    const state = flatState()
    const params = flatParams()

    let nudgeResult
    for (let i = 0; i < NUDGE_TICKS; i++) {
      const result = calc.calculate(state, params, 0)
      // Tick anterior reseta ticks=0; a contagem ocorre dentro de _applyNudge.
      if (result.layerResults.find(r => r.layer === 'L7_5_Nudge')) {
        nudgeResult = result
        break
      }
      state.currentPrice = result.newPrice
    }

    expect(nudgeResult).toBeDefined()
    expect(nudgeResult!.halted).toBe(false)

    // Magnitude exata: 28.00 + 0.01 = 28.01 (fairValue >= price, dir=+1)
    const delta = Math.abs(nudgeResult!.newPrice - 28.00)
    expect(delta).toBeCloseTo(NUDGE_DELTA, 10)
  })

  test('(ii.b) Quando fairValue < currentPrice, nudge desce (delta negativo)', () => {
    const state = flatState()
    // FV ligeiramente abaixo (-0.01): L2 raw = 0.12*(-0.01) = -0.0012; candidate 27.9988
    // arredonda para 28.00 -> moved=false -> contador incrementa normalmente.
    state.fairValue = 27.99
    state.currentPrice = 28.00
    state.ticksSinceLastChange = NUDGE_TICKS - 1

    const result = calc.calculate(state, flatParams(), 0)
    const nudgeLayer = result.layerResults.find(r => r.layer === 'L7_5_Nudge')

    expect(nudgeLayer).toBeDefined()
    // Direcao negativa (FV < P): nudgeDelta = -NUDGE_DELTA exato
    expect(nudgeLayer!.deltaPrice).toBeCloseTo(-NUDGE_DELTA, 10)
    // newPrice abaixo do P (mistura nudge + drift sub-cent de L2)
    expect(result.newPrice).toBeLessThan(28.00)
  })

  test('(iii) Movimento real no tick X reseta contador', () => {
    const state = flatState()
    const params = flatParams()

    // 100 ticks parado
    for (let i = 0; i < 100; i++) {
      calc.calculate(state, params, 0)
    }
    expect(state.ticksSinceLastChange).toBe(100)

    // Tick com news impact suficiente para mover o preco
    state.newsImpact = 0.5
    state.newsImpactTicks = 1
    calc.calculate(state, params, 0)
    expect(state.ticksSinceLastChange).toBe(0)
  })

  test('(iv-a) Nudge nao quebra invariante de L8 (velocity cap)', () => {
    const state = flatState()
    const params = flatParams()

    // Forcar disparo do nudge
    state.ticksSinceLastChange = NUDGE_TICKS - 1
    const result = calc.calculate(state, params, 0)

    // L8 cap absoluto = currentPrice * maxTickChange = 28.00 * 0.0035 = 0.098
    // Nudge magnitude = 0.01 — muito abaixo do cap, deve passar intacto.
    const cap = state.currentPrice * params.maxTickChange
    const move = Math.abs(result.newPrice - 28.00)
    expect(move).toBeLessThanOrEqual(cap + 1e-9)
    expect(result.halted).toBe(false)
  })

  test('(iv-b) Nudge nao dispara cascata de circuit breaker (L10)', () => {
    const state = flatState()
    const params = flatParams()

    // Simula 1h de ticks parados (3600s / 2s = 1800 ticks)
    // Nudge dispara a cada 150 ticks -> ~12 nudges em 1h.
    const TOTAL_TICKS = 1800
    let halts = 0
    let nudges = 0

    for (let i = 0; i < TOTAL_TICKS; i++) {
      const r = calc.calculate(state, params, 0)
      if (r.halted) halts++
      if (r.layerResults.some(x => x.layer === 'L7_5_Nudge')) nudges++
      state.currentPrice = r.newPrice
    }

    expect(halts).toBe(0)
    // Pelo menos 1800/150 - margem para evitar flakiness vs L9 freeze
    expect(nudges).toBeGreaterThanOrEqual(10)
  })

  test('(iv-c) Durante circuit breaker (isPaused=true), nudge nao opera', () => {
    const state = flatState()
    state.ticksSinceLastChange = NUDGE_TICKS - 1
    state.isPaused = true
    const result = calc.calculate(state, flatParams(), 0)

    expect(result.halted).toBe(true)
    // _applyNudge nao foi chamado (pipeline retorna no guard de isPaused)
    expect(state.ticksSinceLastChange).toBe(NUDGE_TICKS - 1) // contador inalterado
  })
})

/**
 * T4.4 — criterio de inatividade por TOLERANCIA percentual/absoluta no lugar da
 * igualdade a 2 casas. Cobre os 6 contratos de aceite (a..f) na funcao pura
 * `classifyNudgeMove`, que o `_applyNudge` consome:
 *   'stable' -> conta inatividade (alimenta o contador do nudge).
 *   'moved'  -> movimento real (reseta o contador, sem nudge espurio).
 *   'invalid'-> aborta defensivamente (sem disparo silencioso, sem excecao).
 */
describe('Nudge tolerance criterion (T4.4)', () => {
  const P = 28.0

  test('(a) move acima da tolerancia conta como movimento real (sem nudge espurio)', () => {
    // tolerancia absoluta 0.01; delta 0.05 (> limiar) -> movimento real.
    expect(classifyNudgeMove(0.05, P, 0, 0.01)).toBe('moved')
    expect(classifyNudgeMove(-0.05, P, 0, 0.01)).toBe('moved')
  })

  test('(b) estavel dentro da tolerancia conta como inatividade (eventual nudge)', () => {
    // delta 0.004 dentro do limiar 0.01 -> permanece estavel.
    expect(classifyNudgeMove(0.004, P, 0, 0.01)).toBe('stable')
    expect(classifyNudgeMove(-0.004, P, 0, 0.01)).toBe('stable')
    // limite inclusivo: |delta| == limiar ainda e estavel.
    expect(classifyNudgeMove(0.01, P, 0, 0.01)).toBe('stable')
  })

  test('(c) ruido de centavos (delta 0.01) com tolerancia >= 0.01 fica estavel; acima dispara reset', () => {
    expect(classifyNudgeMove(0.01, P, 0, 0.01)).toBe('stable')   // ruido absorvido
    expect(classifyNudgeMove(0.0101, P, 0, 0.01)).toBe('moved')  // acima da tolerancia
  })

  test('(d) entrada invalida (NaN/null/undefined) aborta sem excecao', () => {
    expect(classifyNudgeMove(NaN, P, 0, 0.01)).toBe('invalid')
    expect(classifyNudgeMove(0.01, NaN, 0, 0.01)).toBe('invalid')
    expect(classifyNudgeMove(0.01, P, NaN, 0.01)).toBe('invalid')
    expect(classifyNudgeMove(0.01, P, 0, NaN)).toBe('invalid')
    // null/undefined forcados via runtime (chegam da hidratacao do Redis).
    expect(classifyNudgeMove(null as unknown as number, P, 0, 0.01)).toBe('invalid')
    expect(classifyNudgeMove(0.01, undefined as unknown as number, 0, 0.01)).toBe('invalid')
    // Nunca lanca: a chamada acima ja teria estourado se houvesse excecao.
    expect(() => classifyNudgeMove(Infinity, P, 0, 0.01)).not.toThrow()
    expect(classifyNudgeMove(Infinity, P, 0, 0.01)).toBe('invalid')
  })

  test('(e) tolerancia percentual e absoluta ambas zero volta a igualdade estrita a 2 casas', () => {
    // Igualdade estrita: candidate rounded == P rounded -> stable; senao moved.
    expect(classifyNudgeMove(0.004, P, 0, 0)).toBe('stable')   // 28.004 -> 28.00 == 28.00
    expect(classifyNudgeMove(0.006, P, 0, 0)).toBe('moved')    // 28.006 -> 28.01 != 28.00
    expect(classifyNudgeMove(0.0, P, 0, 0)).toBe('stable')
  })

  test('(f) ambos configurados nao-zero aplicam max(pct*ref, abs), nunca a soma', () => {
    // pct alto (0.01 * 28 = 0.28) domina abs (0.01). limiar = 0.28, NAO 0.29 (soma).
    // delta 0.28 esta no limite do max -> estavel; se fosse soma (0.29) tambem seria
    // estavel, entao usamos um delta que distingue os dois: 0.285.
    expect(classifyNudgeMove(0.285, P, 0.01, 0.01)).toBe('moved')   // > max(0.28,0.01)=0.28; soma daria 0.29 (stable)
    expect(classifyNudgeMove(0.28, P, 0.01, 0.01)).toBe('stable')   // == limiar max
    // simetria: abs domina pct quando pct*ref < abs.
    expect(classifyNudgeMove(0.05, P, 0.0001, 0.1)).toBe('stable')  // max(0.0028,0.1)=0.1
    expect(classifyNudgeMove(0.15, P, 0.0001, 0.1)).toBe('moved')   // > 0.1
  })
})
