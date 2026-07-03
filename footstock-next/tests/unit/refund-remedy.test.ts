/**
 * Testes unitários — M067: remédio do arrependimento (CDC Art. 49) por tipo de contratação.
 * Contratação inicial => DOWNGRADE_JOGADOR (reset 2000). Upgrade => RESTORE_PREVIOUS
 * (plano anterior até o vencimento pago, reversão dos créditos de migração, NUNCA reset).
 * Compensação em dinheiro já executada (M066) => volta ao clássico (anti dupla compensação).
 */

import { resolveRefundRemedy, applyRestorePreviousRemedy } from '@/lib/services/refund-remedy'
import type { Prisma } from '@prisma/client'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-07-03T20:00:00Z')

function makeDb(overrides: {
  prior?: Record<string, unknown> | null
  ledger?: Record<string, unknown> | null
} = {}) {
  const subscription = {
    findUnique: jest.fn().mockResolvedValue(
      overrides.prior === undefined
        ? {
            id: 'old',
            planType: 'CRAQUE',
            status: 'CANCELLED',
            expiresAt: new Date(NOW.getTime() + 20 * DAY),
          }
        : overrides.prior
    ),
    update: jest.fn().mockResolvedValue({}),
  }
  const paymentRefund = {
    findUnique: jest.fn().mockResolvedValue(overrides.ledger === undefined ? null : overrides.ledger),
  }
  const user = { findUnique: jest.fn().mockResolvedValue({ fsBalance: 2010 }), update: jest.fn().mockResolvedValue({}) }
  const transaction = { create: jest.fn().mockResolvedValue({}) }
  return { subscription, paymentRefund, user, transaction } as unknown as Prisma.TransactionClient & {
    subscription: Record<string, jest.Mock>
    paymentRefund: Record<string, jest.Mock>
    user: Record<string, jest.Mock>
    transaction: Record<string, jest.Mock>
  }
}

// Sub do upgrade CRAQUE->LENDA: bônus 20000 (diferencial puro), crédito FS$ imediato 0.6
const UPGRADE_SUB = {
  id: 'new',
  planType: 'LENDA',
  previousPlanType: 'CRAQUE',
  bonusAmount: 20000,
  bonusScheduledAt: new Date(NOW.getTime() + 5 * DAY),
  bonusCreditedAt: null,
  upgradeProrationMeta: {
    proration: {
      entries: [
        { priorSubscriptionId: 'old', compensation: 'FS_CREDIT', fsCredit: 0.6, residualCents: 50 },
      ],
    },
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSub = (o: Record<string, unknown>): any => o

describe('resolveRefundRemedy — M067', () => {
  it('sad: contratação inicial (sem previousPlanType) => DOWNGRADE_JOGADOR', async () => {
    const db = makeDb()
    const remedy = await resolveRefundRemedy(db, asSub({ ...UPGRADE_SUB, previousPlanType: null }), NOW)
    expect(remedy.kind).toBe('DOWNGRADE_JOGADOR')
    expect(db.subscription.findUnique).not.toHaveBeenCalled()
  })

  it('sad: veio de JOGADOR (assinatura nova, não upgrade pago) => DOWNGRADE_JOGADOR', async () => {
    const db = makeDb()
    const remedy = await resolveRefundRemedy(db, asSub({ ...UPGRADE_SUB, previousPlanType: 'JOGADOR' }), NOW)
    expect(remedy.kind).toBe('DOWNGRADE_JOGADOR')
  })

  it('happy: upgrade com prior restaurável => RESTORE_PREVIOUS com reversão do FS$ imediato', async () => {
    const db = makeDb()
    const remedy = await resolveRefundRemedy(db, asSub(UPGRADE_SUB), NOW)
    expect(remedy).toMatchObject({
      kind: 'RESTORE_PREVIOUS',
      priorSubscriptionId: 'old',
      priorPlanType: 'CRAQUE',
      fsToRevert: 0.6, // só o crédito pró-rata imediato (bônus 20000 = diferencial puro, não creditado)
    })
    // bônus não creditado e SEM porção rolada (20000 - diferencial 20000 = 0)
    expect((remedy as { rolledBonusToRestore: unknown }).rolledBonusToRestore).toBeNull()
  })

  it('happy: bônus com porção ROLADA não creditada => re-agendada na sub restaurada', async () => {
    const db = makeDb()
    const scheduled = new Date(NOW.getTime() + 3 * DAY)
    const remedy = await resolveRefundRemedy(
      db,
      asSub({ ...UPGRADE_SUB, bonusAmount: 23000, bonusScheduledAt: scheduled }), // 20000 dif + 3000 rolado
      NOW
    )
    expect(remedy).toMatchObject({
      kind: 'RESTORE_PREVIOUS',
      rolledBonusToRestore: { amount: 3000, scheduledAt: scheduled },
    })
  })

  it('happy: bônus JÁ creditado => reverte só o DIFERENCIAL (porção rolada pertence à contratação original)', async () => {
    const db = makeDb()
    const remedy = await resolveRefundRemedy(
      db,
      asSub({ ...UPGRADE_SUB, bonusAmount: 23000, bonusCreditedAt: new Date(NOW.getTime() - DAY) }),
      NOW
    )
    expect(remedy).toMatchObject({ kind: 'RESTORE_PREVIOUS', fsToRevert: 20000.6 }) // 20000 dif + 0.6 pró-rata
    expect((remedy as { rolledBonusToRestore: unknown }).rolledBonusToRestore).toBeNull()
  })

  it('sad: compensação em DINHEIRO executada (ledger SUCCEEDED) => DOWNGRADE (anti dupla compensação)', async () => {
    const db = makeDb({ ledger: { status: 'SUCCEEDED', amountCents: 500 } })
    const remedy = await resolveRefundRemedy(db, asSub(UPGRADE_SUB), NOW)
    expect(remedy.kind).toBe('DOWNGRADE_JOGADOR')
  })

  it('happy: fallback FS$ 1.3x (ledger FAILED_UNSUPPORTED) => soma na reversão', async () => {
    const db = makeDb({ ledger: { status: 'FAILED_UNSUPPORTED', amountCents: 100 } })
    const remedy = await resolveRefundRemedy(db, asSub(UPGRADE_SUB), NOW)
    // 0.6 (imediato) + 1.3 (fallback 100c × 1.3) = 1.9
    expect(remedy).toMatchObject({ kind: 'RESTORE_PREVIOUS', fsToRevert: 1.9 })
  })

  it('sad: prior expirada => DOWNGRADE (não há tempo pago a restaurar)', async () => {
    const db = makeDb({
      prior: { id: 'old', planType: 'CRAQUE', status: 'CANCELLED', expiresAt: new Date(NOW.getTime() - DAY) },
    })
    const remedy = await resolveRefundRemedy(db, asSub(UPGRADE_SUB), NOW)
    expect(remedy.kind).toBe('DOWNGRADE_JOGADOR')
  })

  it('sad: prior em estado inesperado (não-CANCELLED) => DOWNGRADE conservador', async () => {
    const db = makeDb({
      prior: { id: 'old', planType: 'CRAQUE', status: 'ACTIVE', expiresAt: new Date(NOW.getTime() + 20 * DAY) },
    })
    const remedy = await resolveRefundRemedy(db, asSub(UPGRADE_SUB), NOW)
    expect(remedy.kind).toBe('DOWNGRADE_JOGADOR')
  })
})

describe('applyRestorePreviousRemedy — M067', () => {
  const REMEDY = {
    kind: 'RESTORE_PREVIOUS' as const,
    priorSubscriptionId: 'old',
    priorPlanType: 'CRAQUE' as const,
    priorExpiresAt: new Date(NOW.getTime() + 20 * DAY),
    fsToRevert: 0.6,
    rolledBonusToRestore: null,
  }

  it('happy: restaura sub anterior não-recorrente, plano anterior, debita FS$ com extrato negativo', async () => {
    const db = makeDb()
    const result = await applyRestorePreviousRemedy(db, { userId: 'u1', remedy: REMEDY })

    expect(result.fsReverted).toBe(0.6)
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'old' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        cancelledAt: null,
        cancelAtPeriodEnd: true,
        gatewayStatus: 'cancelled',
      }),
    }))
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: { planType: 'CRAQUE', fsBalance: 2010 - 0.6 },
    }))
    expect(db.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ financialType: 'BONUS', fsAmount: -0.6 }),
    }))
  })

  it('happy: clamp — reversão nunca deixa saldo negativo', async () => {
    const db = makeDb()
    ;(db.user.findUnique as jest.Mock).mockResolvedValue({ fsBalance: 5 })
    const result = await applyRestorePreviousRemedy(db, {
      userId: 'u1',
      remedy: { ...REMEDY, fsToRevert: 20000.6 },
    })
    expect(result.fsReverted).toBe(5)
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { planType: 'CRAQUE', fsBalance: 0 },
    }))
  })

  it('happy: porção rolada re-agendada na sub restaurada', async () => {
    const db = makeDb()
    const scheduled = new Date(NOW.getTime() + 3 * DAY)
    await applyRestorePreviousRemedy(db, {
      userId: 'u1',
      remedy: { ...REMEDY, rolledBonusToRestore: { amount: 3000, scheduledAt: scheduled } },
    })
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bonusAmount: 3000,
        bonusScheduledAt: scheduled,
        bonusCreditedAt: null,
      }),
    }))
  })

  it('sad: fsToRevert 0 => sem update de extrato negativo', async () => {
    const db = makeDb()
    const result = await applyRestorePreviousRemedy(db, {
      userId: 'u1',
      remedy: { ...REMEDY, fsToRevert: 0 },
    })
    expect(result.fsReverted).toBe(0)
    expect(db.transaction.create).not.toHaveBeenCalled()
  })
})
