// ============================================================================
// Foot Stock — Testes unitarios: plan-logic (13 funcoes puras)
// ============================================================================

import {
  canUpgrade,
  canDowngrade,
  calcBonusAmount,
  calcSubscriptionAmount,
  isWithinCoolingOff,
  shouldSuspendAccount,
  shouldDowngradeToJogador,
  getRestrictedPositionTypes,
  shouldEnterCancellationLock,
  getCancellationLockExpiry,
  getBlockedFeatures,
  getCompulsoryLiquidationPositions,
  isCancellationLockExpired,
  type SubscriptionForLogic,
} from '../plan-logic'

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeSubscription(overrides: Partial<SubscriptionForLogic> = {}): SubscriptionForLogic {
  return {
    planType: 'CRAQUE',
    startsAt: new Date('2025-01-01T00:00:00Z'),
    expiresAt: new Date('2025-02-01T00:00:00Z'),
    status: 'ACTIVE',
    cancelledAt: null,
    cancellationLockExpiresAt: null,
    ...overrides,
  }
}

function daysFromDate(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _hoursFromDate(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000)
}

// ─── 1. canUpgrade ──────────────────────────────────────────────────────────

describe('canUpgrade', () => {
  test('JOGADOR -> CRAQUE retorna true', () => {
    expect(canUpgrade('JOGADOR', 'CRAQUE')).toBe(true)
  })

  test('JOGADOR -> LENDA retorna true', () => {
    expect(canUpgrade('JOGADOR', 'LENDA')).toBe(true)
  })

  test('CRAQUE -> LENDA retorna true', () => {
    expect(canUpgrade('CRAQUE', 'LENDA')).toBe(true)
  })

  test('CRAQUE -> JOGADOR retorna false (downgrade)', () => {
    expect(canUpgrade('CRAQUE', 'JOGADOR')).toBe(false)
  })

  test('LENDA -> LENDA retorna false (mesmo plano)', () => {
    expect(canUpgrade('LENDA', 'LENDA')).toBe(false)
  })

  test('LENDA -> CRAQUE retorna false (downgrade)', () => {
    expect(canUpgrade('LENDA', 'CRAQUE')).toBe(false)
  })
})

// ─── 2. canDowngrade ────────────────────────────────────────────────────────

describe('canDowngrade', () => {
  test('LENDA -> JOGADOR retorna false', () => {
    expect(canDowngrade('LENDA', 'JOGADOR')).toBe(false)
  })

  test('CRAQUE -> JOGADOR retorna false', () => {
    expect(canDowngrade('CRAQUE', 'JOGADOR')).toBe(false)
  })

  test('JOGADOR -> CRAQUE retorna false', () => {
    expect(canDowngrade('JOGADOR', 'CRAQUE')).toBe(false)
  })
})

// ─── 3. calcBonusAmount ─────────────────────────────────────────────────────

describe('calcBonusAmount', () => {
  test('JOGADOR recebe bonus de 2000 FS$', () => {
    expect(calcBonusAmount('JOGADOR')).toBe(2000)
  })

  test('CRAQUE recebe bonus de 5000 FS$', () => {
    expect(calcBonusAmount('CRAQUE')).toBe(5000)
  })

  test('LENDA recebe bonus de 25000 FS$', () => {
    expect(calcBonusAmount('LENDA')).toBe(25000)
  })
})

// ─── 4. calcSubscriptionAmount ──────────────────────────────────────────────

describe('calcSubscriptionAmount', () => {
  test('JOGADOR monthly = 0 (gratuito)', () => {
    expect(calcSubscriptionAmount('JOGADOR', 'monthly')).toBe(0)
  })

  test('JOGADOR yearly = 0 (gratuito)', () => {
    expect(calcSubscriptionAmount('JOGADOR', 'yearly')).toBe(0)
  })

  test('CRAQUE monthly = 1990 centavos', () => {
    expect(calcSubscriptionAmount('CRAQUE', 'monthly')).toBe(1990)
  })

  test('CRAQUE yearly = 17910 centavos (-25%)', () => {
    expect(calcSubscriptionAmount('CRAQUE', 'yearly')).toBe(17910)
  })

  test('LENDA monthly = 3990 centavos', () => {
    expect(calcSubscriptionAmount('LENDA', 'monthly')).toBe(3990)
  })

  test('LENDA yearly = 35910 centavos (-25%)', () => {
    expect(calcSubscriptionAmount('LENDA', 'yearly')).toBe(35910)
  })
})

// ─── 5. isWithinCoolingOff ──────────────────────────────────────────────────

describe('isWithinCoolingOff', () => {
  const startsAt = new Date('2025-01-01T00:00:00Z')

  test('6 dias apos inicio retorna true', () => {
    const sub = makeSubscription({ startsAt })
    const now = daysFromDate(startsAt, 6)
    expect(isWithinCoolingOff(sub, now)).toBe(true)
  })

  test('8 dias apos inicio retorna false', () => {
    const sub = makeSubscription({ startsAt })
    const now = daysFromDate(startsAt, 8)
    expect(isWithinCoolingOff(sub, now)).toBe(false)
  })

  test('exatamente 7 dias (limite) retorna true (<=)', () => {
    const sub = makeSubscription({ startsAt })
    const now = daysFromDate(startsAt, 7)
    expect(isWithinCoolingOff(sub, now)).toBe(true)
  })

  test('7 dias + 1ms retorna false', () => {
    const sub = makeSubscription({ startsAt })
    const now = new Date(daysFromDate(startsAt, 7).getTime() + 1)
    expect(isWithinCoolingOff(sub, now)).toBe(false)
  })
})

// ─── 6. shouldSuspendAccount ────────────────────────────────────────────────

describe('shouldSuspendAccount', () => {
  const expiresAt = new Date('2025-02-01T00:00:00Z')

  test('expirado ha 3 dias com status ACTIVE retorna true', () => {
    const sub = makeSubscription({ expiresAt, status: 'ACTIVE' })
    const now = daysFromDate(expiresAt, 3)
    expect(shouldSuspendAccount(sub, now)).toBe(true)
  })

  test('expirado ha 10 dias com status ACTIVE retorna false (fora da graca)', () => {
    const sub = makeSubscription({ expiresAt, status: 'ACTIVE' })
    const now = daysFromDate(expiresAt, 10)
    expect(shouldSuspendAccount(sub, now)).toBe(false)
  })

  test('expiracao no futuro retorna false', () => {
    const sub = makeSubscription({ expiresAt, status: 'ACTIVE' })
    const now = daysFromDate(expiresAt, -5)
    expect(shouldSuspendAccount(sub, now)).toBe(false)
  })

  test('status SUSPENDED retorna false', () => {
    const sub = makeSubscription({ expiresAt, status: 'SUSPENDED' })
    const now = daysFromDate(expiresAt, 3)
    expect(shouldSuspendAccount(sub, now)).toBe(false)
  })
})

// ─── 7. shouldDowngradeToJogador ────────────────────────────────────────────

describe('shouldDowngradeToJogador', () => {
  const expiresAt = new Date('2025-02-01T00:00:00Z')

  test('SUSPENDED expirado ha 10 dias retorna true', () => {
    const sub = makeSubscription({ expiresAt, status: 'SUSPENDED' })
    const now = daysFromDate(expiresAt, 10)
    expect(shouldDowngradeToJogador(sub, now)).toBe(true)
  })

  test('EXPIRED expirado ha 10 dias retorna true', () => {
    const sub = makeSubscription({ expiresAt, status: 'EXPIRED' })
    const now = daysFromDate(expiresAt, 10)
    expect(shouldDowngradeToJogador(sub, now)).toBe(true)
  })

  test('ACTIVE retorna false (nao elegivel)', () => {
    const sub = makeSubscription({ expiresAt, status: 'ACTIVE' })
    const now = daysFromDate(expiresAt, 10)
    expect(shouldDowngradeToJogador(sub, now)).toBe(false)
  })

  test('SUSPENDED dentro do periodo de graca retorna false', () => {
    const sub = makeSubscription({ expiresAt, status: 'SUSPENDED' })
    const now = daysFromDate(expiresAt, 5)
    expect(shouldDowngradeToJogador(sub, now)).toBe(false)
  })
})

// ─── 8. getRestrictedPositionTypes ──────────────────────────────────────────

describe('getRestrictedPositionTypes', () => {
  test('LENDA -> JOGADOR retorna SHORT e LEVERAGED', () => {
    expect(getRestrictedPositionTypes('LENDA', 'JOGADOR')).toEqual(['SHORT', 'LEVERAGED'])
  })

  test('LENDA -> CRAQUE retorna SHORT e LEVERAGED', () => {
    expect(getRestrictedPositionTypes('LENDA', 'CRAQUE')).toEqual(['SHORT', 'LEVERAGED'])
  })

  test('CRAQUE -> JOGADOR retorna array vazio', () => {
    expect(getRestrictedPositionTypes('CRAQUE', 'JOGADOR')).toEqual([])
  })

  test('JOGADOR -> CRAQUE retorna array vazio', () => {
    expect(getRestrictedPositionTypes('JOGADOR', 'CRAQUE')).toEqual([])
  })
})

// ─── 9. shouldEnterCancellationLock ─────────────────────────────────────────

describe('shouldEnterCancellationLock', () => {
  const startsAt = new Date('2025-01-01T00:00:00Z')

  test('8 dias apos inicio retorna true (fora do cooling off)', () => {
    const sub = makeSubscription({ startsAt })
    const now = daysFromDate(startsAt, 8)
    expect(shouldEnterCancellationLock(sub, now)).toBe(true)
  })

  test('3 dias apos inicio retorna false (dentro do cooling off)', () => {
    const sub = makeSubscription({ startsAt })
    const now = daysFromDate(startsAt, 3)
    expect(shouldEnterCancellationLock(sub, now)).toBe(false)
  })

  test('exatamente 7 dias retorna false (cooling off inclui dia 7)', () => {
    const sub = makeSubscription({ startsAt })
    const now = daysFromDate(startsAt, 7)
    expect(shouldEnterCancellationLock(sub, now)).toBe(false)
  })
})

// ─── 10. getCancellationLockExpiry ──────────────────────────────────────────

describe('getCancellationLockExpiry', () => {
  test('retorna data + exatamente 48h', () => {
    const requestDate = new Date('2025-01-15T10:00:00Z')
    const expected = new Date('2025-01-17T10:00:00Z')
    expect(getCancellationLockExpiry(requestDate)).toEqual(expected)
  })

  test('lida com virada de mes', () => {
    const requestDate = new Date('2025-01-31T00:00:00Z')
    const expected = new Date('2025-02-02T00:00:00Z')
    expect(getCancellationLockExpiry(requestDate)).toEqual(expected)
  })
})

// ─── 11. getBlockedFeatures ─────────────────────────────────────────────────

describe('getBlockedFeatures', () => {
  test('LENDA retorna 7 features bloqueadas', () => {
    const features = getBlockedFeatures('LENDA')
    expect(features).toHaveLength(7)
    expect(features).toEqual([
      'ordens limitadas',
      'ordens agendadas',
      'OCO',
      'short selling',
      'alavancagem 2x',
      'assessor IA',
      'ligas PRO',
    ])
  })

  test('CRAQUE retorna 2 features bloqueadas', () => {
    const features = getBlockedFeatures('CRAQUE')
    expect(features).toHaveLength(2)
    expect(features).toEqual(['ordens limitadas', 'ordens agendadas'])
  })

  test('JOGADOR retorna array vazio', () => {
    expect(getBlockedFeatures('JOGADOR')).toEqual([])
  })
})

// ─── 12. getCompulsoryLiquidationPositions ──────────────────────────────────

describe('getCompulsoryLiquidationPositions', () => {
  test('LENDA retorna SHORT, LEVERAGED e OCO', () => {
    const positions = getCompulsoryLiquidationPositions('LENDA')
    expect(positions).toHaveLength(3)
    expect(positions).toEqual(['SHORT', 'LEVERAGED', 'OCO'])
  })

  test('CRAQUE retorna array vazio', () => {
    expect(getCompulsoryLiquidationPositions('CRAQUE')).toEqual([])
  })

  test('JOGADOR retorna array vazio', () => {
    expect(getCompulsoryLiquidationPositions('JOGADOR')).toEqual([])
  })
})

// ─── 13. isCancellationLockExpired ──────────────────────────────────────────

describe('isCancellationLockExpired', () => {
  test('lock expirado (passado) retorna true', () => {
    const sub = makeSubscription({
      cancellationLockExpiresAt: new Date('2025-01-10T00:00:00Z'),
    })
    const now = new Date('2025-01-11T00:00:00Z')
    expect(isCancellationLockExpired(sub, now)).toBe(true)
  })

  test('lock no futuro retorna false', () => {
    const sub = makeSubscription({
      cancellationLockExpiresAt: new Date('2025-01-10T00:00:00Z'),
    })
    const now = new Date('2025-01-09T00:00:00Z')
    expect(isCancellationLockExpired(sub, now)).toBe(false)
  })

  test('sem cancellationLockExpiresAt retorna false', () => {
    const sub = makeSubscription({ cancellationLockExpiresAt: null })
    const now = new Date('2025-01-11T00:00:00Z')
    expect(isCancellationLockExpired(sub, now)).toBe(false)
  })

  test('exatamente no momento da expiracao retorna true (<=)', () => {
    const lockDate = new Date('2025-01-10T00:00:00Z')
    const sub = makeSubscription({ cancellationLockExpiresAt: lockDate })
    expect(isCancellationLockExpired(sub, lockDate)).toBe(true)
  })
})
