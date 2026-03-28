import { checkPlanAccess, assertPlanAccess, PlanUpgradeError, getUpgradePlan, checkDailyOrderLimit } from '../planGuard'

describe('checkPlanAccess', () => {
  test('LENDA acessa tudo', () => {
    expect(checkPlanAccess({ planType: 'LENDA' }, 'LENDA')).toBe(true)
    expect(checkPlanAccess({ planType: 'LENDA' }, 'CRAQUE')).toBe(true)
    expect(checkPlanAccess({ planType: 'LENDA' }, 'JOGADOR')).toBe(true)
  })

  test('CRAQUE acessa CRAQUE e JOGADOR, mas nao LENDA', () => {
    expect(checkPlanAccess({ planType: 'CRAQUE' }, 'CRAQUE')).toBe(true)
    expect(checkPlanAccess({ planType: 'CRAQUE' }, 'JOGADOR')).toBe(true)
    expect(checkPlanAccess({ planType: 'CRAQUE' }, 'LENDA')).toBe(false)
  })

  test('JOGADOR so acessa JOGADOR', () => {
    expect(checkPlanAccess({ planType: 'JOGADOR' }, 'JOGADOR')).toBe(true)
    expect(checkPlanAccess({ planType: 'JOGADOR' }, 'CRAQUE')).toBe(false)
    expect(checkPlanAccess({ planType: 'JOGADOR' }, 'LENDA')).toBe(false)
  })
})

describe('assertPlanAccess', () => {
  test('nao lanca erro quando plano e suficiente', () => {
    expect(() => assertPlanAccess({ planType: 'LENDA' }, 'JOGADOR')).not.toThrow()
    expect(() => assertPlanAccess({ planType: 'CRAQUE' }, 'CRAQUE')).not.toThrow()
  })

  test('lanca PlanUpgradeError quando plano e insuficiente', () => {
    expect(() => assertPlanAccess({ planType: 'JOGADOR' }, 'CRAQUE')).toThrow(PlanUpgradeError)
  })

  test('PlanUpgradeError tem propriedades corretas', () => {
    try {
      assertPlanAccess({ planType: 'JOGADOR' }, 'LENDA')
      // Nao deve chegar aqui
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(PlanUpgradeError)
      const error = err as PlanUpgradeError
      expect(error.code).toBe('PLAN_LIMIT_EXCEEDED')
      expect(error.currentPlan).toBe('JOGADOR')
      expect(error.requiredPlan).toBe('LENDA')
      expect(error.upgradeTo).toBe('CRAQUE')
    }
  })

  test('PlanUpgradeError para CRAQUE sugere LENDA como upgrade', () => {
    try {
      assertPlanAccess({ planType: 'CRAQUE' }, 'LENDA')
      expect(true).toBe(false)
    } catch (err) {
      const error = err as PlanUpgradeError
      expect(error.upgradeTo).toBe('LENDA')
    }
  })
})

describe('getUpgradePlan', () => {
  test('JOGADOR -> CRAQUE', () => {
    expect(getUpgradePlan('JOGADOR')).toBe('CRAQUE')
  })

  test('CRAQUE -> LENDA', () => {
    expect(getUpgradePlan('CRAQUE')).toBe('LENDA')
  })

  test('LENDA -> null (ja e o maximo)', () => {
    expect(getUpgradePlan('LENDA')).toBeNull()
  })
})

describe('checkDailyOrderLimit', () => {
  test('JOGADOR com 0 ordens pode criar mais', () => {
    expect(checkDailyOrderLimit('JOGADOR', 0)).toBe(true)
  })

  test('JOGADOR com 4 ordens pode criar mais (limite 5)', () => {
    expect(checkDailyOrderLimit('JOGADOR', 4)).toBe(true)
  })

  test('JOGADOR com 5 ordens NAO pode criar mais', () => {
    expect(checkDailyOrderLimit('JOGADOR', 5)).toBe(false)
  })

  test('CRAQUE com 19 ordens pode criar mais (limite 20)', () => {
    expect(checkDailyOrderLimit('CRAQUE', 19)).toBe(true)
  })

  test('CRAQUE com 20 ordens NAO pode criar mais', () => {
    expect(checkDailyOrderLimit('CRAQUE', 20)).toBe(false)
  })

  test('LENDA com 49 ordens pode criar mais (limite 50)', () => {
    expect(checkDailyOrderLimit('LENDA', 49)).toBe(true)
  })

  test('LENDA com 50 ordens NAO pode criar mais', () => {
    expect(checkDailyOrderLimit('LENDA', 50)).toBe(false)
  })
})
