/**
 * Testes unitários — M066: pró-rata do tempo não usado em upgrade de plano.
 * calcProRataResidualCents (janela real, ceil a favor do usuário, cap no valor pago)
 * e residualToFsCredit (conversão FS$ com multiplicador).
 * Fonte: estudo UPGRADE-PRICING-STRATEGY-2026-07-03 (Fase 1b).
 */

import {
  calcProRataResidualCents,
  residualToFsCredit,
  UPGRADE_PRORATION_FS_MULTIPLIER,
  UPGRADE_PRORATION_FALLBACK_FS_MULTIPLIER,
} from '@/lib/services/plan-logic'

const DAY = 24 * 60 * 60 * 1000
const start = new Date('2026-07-01T00:00:00Z')
const end = new Date('2026-07-31T00:00:00Z') // ciclo de 30 dias

describe('calcProRataResidualCents — M066', () => {
  it('happy: meio do ciclo => metade do valor (ceil)', () => {
    const now = new Date(start.getTime() + 15 * DAY)
    expect(
      calcProRataResidualCents({ amountCents: 1000, windowStart: start, windowEnd: end, now })
    ).toBe(500)
  })

  it('happy: início do ciclo (dia 0) => valor cheio (cap no amount)', () => {
    expect(
      calcProRataResidualCents({ amountCents: 1000, windowStart: start, windowEnd: end, now: start })
    ).toBe(1000)
  })

  it('happy: ceil arredonda A FAVOR do usuário', () => {
    // 1 dia restante de 30 sobre 100 centavos = 3.33... => ceil 4
    const now = new Date(end.getTime() - 1 * DAY)
    expect(
      calcProRataResidualCents({ amountCents: 100, windowStart: start, windowEnd: end, now })
    ).toBe(4)
  })

  it('sad: ciclo expirado (now >= windowEnd) => 0', () => {
    expect(
      calcProRataResidualCents({ amountCents: 1000, windowStart: start, windowEnd: end, now: end })
    ).toBe(0)
    const after = new Date(end.getTime() + DAY)
    expect(
      calcProRataResidualCents({ amountCents: 1000, windowStart: start, windowEnd: end, now: after })
    ).toBe(0)
  })

  it('sad: janela inválida (end <= start) => 0', () => {
    expect(
      calcProRataResidualCents({ amountCents: 1000, windowStart: end, windowEnd: start, now: start })
    ).toBe(0)
    expect(
      calcProRataResidualCents({ amountCents: 1000, windowStart: start, windowEnd: start, now: start })
    ).toBe(0)
  })

  it('sad: amount inválido (0/negativo/NaN) => 0', () => {
    const now = new Date(start.getTime() + DAY)
    expect(calcProRataResidualCents({ amountCents: 0, windowStart: start, windowEnd: end, now })).toBe(0)
    expect(calcProRataResidualCents({ amountCents: -5, windowStart: start, windowEnd: end, now })).toBe(0)
    expect(calcProRataResidualCents({ amountCents: NaN, windowStart: start, windowEnd: end, now })).toBe(0)
  })

  it('sad: now antes do início da janela => cap no valor cheio (nunca excede o pago)', () => {
    const before = new Date(start.getTime() - 5 * DAY)
    expect(
      calcProRataResidualCents({ amountCents: 1000, windowStart: start, windowEnd: end, now: before })
    ).toBe(1000)
  })
})

describe('residualToFsCredit — M066', () => {
  it('happy: converte centavos em FS$ com multiplicador (2 casas)', () => {
    // 90 centavos × 1.2 = 108 => FS$ 1.08
    expect(residualToFsCredit(90, UPGRADE_PRORATION_FS_MULTIPLIER)).toBe(1.08)
    // 500 centavos × 1.3 = 650 => FS$ 6.50
    expect(residualToFsCredit(500, UPGRADE_PRORATION_FALLBACK_FS_MULTIPLIER)).toBe(6.5)
  })

  it('happy: preço real — R$14,90 restantes × 1.2 => FS$ 17.88', () => {
    expect(residualToFsCredit(1490, 1.2)).toBe(17.88)
  })

  it('sad: residual 0/negativo/NaN => 0', () => {
    expect(residualToFsCredit(0, 1.2)).toBe(0)
    expect(residualToFsCredit(-10, 1.2)).toBe(0)
    expect(residualToFsCredit(NaN, 1.2)).toBe(0)
  })
})
