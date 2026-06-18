/**
 * @jest-environment node
 *
 * T4.1 (loop 06-17-motor-footstock-correcoes-variacoes) — Escalonamento de
 * L4/L5/L6/L7 pelo multiplicador de SESSÃO (state.volatilityMultiplier).
 *
 * Contrato verificado:
 *   - Sessão normal (volatilityMultiplier = 1.0): impacto INALTERADO (responsividade).
 *   - Janela de freeze/dimmer (multiplicador < 1.0): o impacto AGREGADO de L4-L7 cai
 *     na PROPORÇÃO do multiplicador, e cada camada individualmente também — nenhuma
 *     camada pode ignorar o multiplicador (condição de reversão da task).
 *   - Freeze total (multiplicador = 0.0): impacto agregado dessas camadas = 0.
 *   - O freeze da L9 (dailySigmaMultiplier) NÃO é aplicado por estas camadas — ele
 *     permanece exclusivo de L1/L3 (volatilidade gaussiana). Estas camadas leem apenas
 *     o multiplicador de sessão.
 */
import { L4_OrderFlowImbalance } from '../../layers/L4_OrderFlowImbalance'
import { L5_KyleLambda } from '../../layers/L5_KyleLambda'
import { L6_SupplyScaling } from '../../layers/L6_SupplyScaling'
import { L7_PressureQueue } from '../../layers/L7_PressureQueue'
import type { AssetState, ClusterParams } from '../../../types/motor.types'

// Estado fresco por medição: L4 muta state.ofiState e L7 muta o countdown de notícia,
// então cada camada recebe um estado novo para que as medições sejam reproduzíveis.
const baseState = (overrides: Partial<AssetState> = {}): AssetState => ({
  id: 'a1',
  ticker: 'FLM3',
  cluster: 'A_TOP',
  state: 'SP',
  currentPrice: 100,
  openPrice: 100,
  highPrice: 100,
  lowPrice: 100,
  closePrice: 100,
  fairValue: 100,
  volume: 200_000, // L6: consumo de float (com drift > 0 gera impacto)
  variance: 0.0001,
  pendingBuyVolume: 1200, // L4/L5: fluxo direcional comprador
  pendingSellVolume: 400,
  isPaused: false,
  haltReason: null,
  haltResumeAt: null,
  newsImpact: 0.02, // L7: notícia ativa abaixo do spot cap (±2.5%)
  newsImpactTicks: 30,
  ofiState: 0,
  dailyVolAccum: 0,
  dailySigmaMultiplier: 1.0,
  volatilityMultiplier: 1.0,
  ...overrides,
})

const params = (overrides: Partial<ClusterParams> = {}): ClusterParams => ({
  cluster: 'A_TOP',
  baseVolume: 50_000,
  drift: 0.001, // L6 precisa de drift != 0
  theta: 0.12,
  sigma: 0.001,
  garchAlpha: 0.12,
  garchBeta: 0.85,
  lambdaKyle: 0.0001,
  spread: 0.0005,
  maxTickChange: 0.0035,
  ofiDecay: 0.91,
  alphaOfi: 0.001,
  ...overrides,
})

interface LayerDeltas {
  l4: number
  l5: number
  l6: number
  l7: number
  total: number
}

/** Mede o delta de cada camada para um dado multiplicador de sessão. */
function measure(volatilityMultiplier: number): LayerDeltas {
  const p = params()
  const l4 = new L4_OrderFlowImbalance().applyLayer(baseState({ volatilityMultiplier }), p, 0).deltaPrice
  const l5 = new L5_KyleLambda().applyLayer(baseState({ volatilityMultiplier }), p, 0).deltaPrice
  const l6 = new L6_SupplyScaling().applyLayer(baseState({ volatilityMultiplier }), p, 0).deltaPrice
  const l7 = new L7_PressureQueue().applyLayer(baseState({ volatilityMultiplier }), p, 0).deltaPrice
  return { l4, l5, l6, l7, total: l4 + l5 + l6 + l7 }
}

describe('T4.1 — L4/L5/L6/L7 escaladas por volatilityMultiplier', () => {
  test('sessão normal (1.0): cada camada gera impacto não-nulo (responsividade preservada)', () => {
    const normal = measure(1.0)
    expect(normal.l4).toBeGreaterThan(0)
    expect(normal.l5).toBeGreaterThan(0)
    expect(normal.l6).toBeGreaterThan(0)
    expect(normal.l7).toBeGreaterThan(0)
    expect(normal.total).toBeGreaterThan(0)
  })

  test('dimmer (0.1): impacto AGREGADO cai exatamente na proporção do multiplicador', () => {
    const normal = measure(1.0)
    const dimmed = measure(0.1)
    expect(dimmed.total).toBeCloseTo(normal.total * 0.1, 10)
  })

  test('dimmer (0.1): NENHUMA camada ignora o multiplicador (proporcionalidade por camada)', () => {
    const normal = measure(1.0)
    const dimmed = measure(0.1)
    expect(dimmed.l4).toBeCloseTo(normal.l4 * 0.1, 10)
    expect(dimmed.l5).toBeCloseTo(normal.l5 * 0.1, 10)
    expect(dimmed.l6).toBeCloseTo(normal.l6 * 0.1, 10)
    expect(dimmed.l7).toBeCloseTo(normal.l7 * 0.1, 10)
  })

  test('dimmer intermediário (0.3): proporcionalidade linear preservada', () => {
    const normal = measure(1.0)
    const dim = measure(0.3)
    expect(dim.total).toBeCloseTo(normal.total * 0.3, 10)
  })

  test('freeze total (0.0): impacto agregado dessas camadas zera', () => {
    const frozen = measure(0.0)
    expect(frozen.l4).toBe(0)
    expect(frozen.l5).toBe(0)
    expect(frozen.l6).toBe(0)
    expect(frozen.l7).toBe(0)
    expect(frozen.total).toBe(0)
  })

  test('multiplicador ausente (undefined) é tratado como 1.0 — sem regressão silenciosa', () => {
    const p = params()
    // Estado sem volatilityMultiplier explícito (?? 1.0 no layer)
    const noMul = baseState()
    delete (noMul as Partial<AssetState>).volatilityMultiplier
    const explicitOne = measure(1.0)
    const l4 = new L4_OrderFlowImbalance().applyLayer({ ...noMul }, p, 0).deltaPrice
    const l6 = new L6_SupplyScaling().applyLayer({ ...noMul }, p, 0).deltaPrice
    expect(l4).toBeCloseTo(explicitOne.l4, 10)
    expect(l6).toBeCloseTo(explicitOne.l6, 10)
  })

  test('freeze da L9 (dailySigmaMultiplier) NÃO afeta L4-L7 — ortogonal ao multiplicador de sessão', () => {
    const p = params()
    // dailySigmaMultiplier = 0 (freeze L9) mas sessão normal (volatilityMultiplier = 1.0):
    // L4-L7 NÃO devem encolher — o freeze da L9 é exclusivo de L1/L3.
    const l9Frozen = baseState({ dailySigmaMultiplier: 0.0, volatilityMultiplier: 1.0 })
    const l4 = new L4_OrderFlowImbalance().applyLayer({ ...l9Frozen }, p, 0).deltaPrice
    const l5 = new L5_KyleLambda().applyLayer({ ...l9Frozen }, p, 0).deltaPrice
    const l6 = new L6_SupplyScaling().applyLayer({ ...l9Frozen }, p, 0).deltaPrice
    const l7 = new L7_PressureQueue().applyLayer({ ...l9Frozen }, p, 0).deltaPrice
    const normal = measure(1.0)
    expect(l4).toBeCloseTo(normal.l4, 10)
    expect(l5).toBeCloseTo(normal.l5, 10)
    expect(l6).toBeCloseTo(normal.l6, 10)
    expect(l7).toBeCloseTo(normal.l7, 10)
  })
})
