// ============================================================================
// Foot Stock — Testes do planAccess
// ============================================================================

import { planHasFeature, getPlanFeatures, hasPlanAccess } from '../planAccess'

describe('planHasFeature', () => {
  test('LENDA tem realtime_prices', () => {
    expect(planHasFeature('LENDA', 'realtime_prices')).toBe(true)
  })

  test('JOGADOR não tem realtime_prices', () => {
    expect(planHasFeature('JOGADOR', 'realtime_prices')).toBe(false)
  })

  test('CRAQUE tem ai_analysis', () => {
    expect(planHasFeature('CRAQUE', 'ai_analysis')).toBe(true)
  })

  test('JOGADOR não tem ai_analysis', () => {
    expect(planHasFeature('JOGADOR', 'ai_analysis')).toBe(false)
  })

  test('LENDA tem short_orders', () => {
    expect(planHasFeature('LENDA', 'short_orders')).toBe(true)
  })

  test('CRAQUE não tem short_orders', () => {
    expect(planHasFeature('CRAQUE', 'short_orders')).toBe(false)
  })

  test('JOGADOR tem delayed_60m', () => {
    expect(planHasFeature('JOGADOR', 'delayed_60m')).toBe(true)
  })

  test('LENDA tem todas as features do CRAQUE', () => {
    const craqueFeatures = getPlanFeatures('CRAQUE')
    const lendaFeatures = getPlanFeatures('LENDA')
    for (const feature of craqueFeatures) {
      // CRAQUE tem delayed_30m, LENDA tem realtime_prices em vez disso
      if (feature === 'delayed_30m') continue
      expect(lendaFeatures).toContain(feature)
    }
  })
})

describe('getPlanFeatures', () => {
  test('JOGADOR tem exatamente 1 feature', () => {
    expect(getPlanFeatures('JOGADOR')).toHaveLength(1)
  })

  test('CRAQUE tem mais features que JOGADOR', () => {
    expect(getPlanFeatures('CRAQUE').length).toBeGreaterThan(getPlanFeatures('JOGADOR').length)
  })

  test('LENDA tem mais features que CRAQUE', () => {
    expect(getPlanFeatures('LENDA').length).toBeGreaterThan(getPlanFeatures('CRAQUE').length)
  })
})

describe('hasPlanAccess', () => {
  test('LENDA tem acesso a features de JOGADOR', () => {
    expect(hasPlanAccess('LENDA', 'JOGADOR')).toBe(true)
  })

  test('JOGADOR não tem acesso a features de CRAQUE', () => {
    expect(hasPlanAccess('JOGADOR', 'CRAQUE')).toBe(false)
  })

  test('CRAQUE tem acesso a features de CRAQUE', () => {
    expect(hasPlanAccess('CRAQUE', 'CRAQUE')).toBe(true)
  })

  test('CRAQUE não tem acesso a features de LENDA', () => {
    expect(hasPlanAccess('CRAQUE', 'LENDA')).toBe(false)
  })
})
