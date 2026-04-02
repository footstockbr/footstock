// ============================================================================
// Foot Stock — Testes unitários: job bonus-credit
// Cobre: crédito completo, diferencial de upgrade, bonusAmount=0 (downgrade)
// ============================================================================

import { processBonusCredits } from '../bonus-credit'

// ─── Mock: prisma ────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findMany: jest.fn(), update: jest.fn() },
    user:         { update: jest.fn() },
    $transaction: jest.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

// ─── Mock: NotificationStub ──────────────────────────────────────────────────

jest.mock('@/lib/notifications/stubs/NotificationStub', () => ({
  NotificationStub: { notify: jest.fn().mockResolvedValue(undefined) },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NotificationStub: mockNotification } = require('@/lib/notifications/stubs/NotificationStub')

// ─── Mock: calcBonusAmount ───────────────────────────────────────────────────
// Bônus reais: JOGADOR=2000, CRAQUE=5000, LENDA=10000

jest.mock('@/lib/services/plan-logic', () => ({
  calcBonusAmount: jest.fn((planType: string): number => {
    const bonuses: Record<string, number> = {
      JOGADOR: 2000,
      CRAQUE:  5000,
      LENDA:   10000,
    }
    return bonuses[planType] ?? 0
  }),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Cria subscription pendente de crédito de bônus */
function makePendingSub(overrides: Record<string, unknown> = {}) {
  return {
    id:               'sub-bonus-1',
    userId:           'user-1',
    planType:         'CRAQUE',
    previousPlanType: null,        // nova assinatura por padrão
    bonusScheduledAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // T+8 (passado)
    cancelledAt:      null,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('processBonusCredits', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // $transaction executa os callbacks passados
    mockPrisma.$transaction.mockResolvedValue(undefined)
    mockPrisma.subscription.update.mockResolvedValue({})
    mockPrisma.user.update.mockResolvedValue({})
  })

  // ────────────────────────────────────────────────────────────────────────────
  test('nova assinatura CRAQUE: credita bônus completo via $transaction e notifica', async () => {
    // bonusScheduledAt no passado, bonusCreditedAt=null (retornado pelo WHERE)
    const sub = makePendingSub({ planType: 'CRAQUE', previousPlanType: null })
    mockPrisma.subscription.findMany.mockResolvedValue([sub])

    const result = await processBonusCredits()

    // Deve chamar $transaction com increment de fsBalance e update de bonusCreditedAt
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    const transactionArgs: unknown[] = mockPrisma.$transaction.mock.calls[0][0]
    expect(transactionArgs).toHaveLength(2)

    // Deve notificar usuário com BONUS_CREDITED
    expect(mockNotification.notify).toHaveBeenCalledWith(
      'user-1',
      'BONUS_CREDITED',
      expect.objectContaining({ amount: 5000, planName: 'CRAQUE', isUpgrade: false })
    )

    expect(result.processed).toBe(1)
    expect(result.errors).toBe(0)
    expect(result.details[0]!.action).toContain('BONUS_CREDITED_5000FS')
  })

  // ────────────────────────────────────────────────────────────────────────────
  test('idempotência: bonusCreditedAt preenchido não é retornado pelo query (WHERE null)', async () => {
    // O WHERE bonusCreditedAt: null do findMany garante que subscriptions já creditadas
    // nunca chegam aqui — simulamos isso retornando lista vazia
    mockPrisma.subscription.findMany.mockResolvedValue([])

    const result = await processBonusCredits()

    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockNotification.notify).not.toHaveBeenCalled()
    expect(result.processed).toBe(0)
  })

  // ────────────────────────────────────────────────────────────────────────────
  test('upgrade JOGADOR→CRAQUE: credita apenas diferencial (5000 - 2000 = 3000 FS)', async () => {
    const sub = makePendingSub({
      planType:         'CRAQUE',
      previousPlanType: 'JOGADOR', // upgrade — G-02 diferencial
    })
    mockPrisma.subscription.findMany.mockResolvedValue([sub])

    const result = await processBonusCredits()

    // Deve chamar $transaction (crédito diferencial, não zero)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)

    // Notificação com isUpgrade=true e amount=3000 (diferencial)
    expect(mockNotification.notify).toHaveBeenCalledWith(
      'user-1',
      'BONUS_CREDITED',
      expect.objectContaining({ amount: 3000, isUpgrade: true })
    )

    expect(result.details[0]!.action).toBe('DIFFERENTIAL_BONUS_CREDITED_3000FS')
    expect(result.processed).toBe(1)
  })

  // ────────────────────────────────────────────────────────────────────────────
  test('bonusAmount=0 (downgrade inesperado): marca bonusCreditedAt sem incrementar saldo', async () => {
    // Simula cenário onde diferencial é negativo (ex: CRAQUE→JOGADOR que não deveria acontecer)
    // calcBonusAmount mocado: JOGADOR=2000 - CRAQUE=5000 → Math.max(0, -3000) = 0
    const sub = makePendingSub({
      planType:         'JOGADOR',
      previousPlanType: 'CRAQUE',  // "downgrade" → diferencial negativo → bonusAmount=0
    })
    mockPrisma.subscription.findMany.mockResolvedValue([sub])

    const result = await processBonusCredits()

    // Não deve executar $transaction (sem crédito)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()

    // Deve apenas marcar bonusCreditedAt
    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-bonus-1' },
        data:  expect.objectContaining({ bonusCreditedAt: expect.any(Date) }),
      })
    )

    // Sem notificação para bonusAmount=0
    expect(mockNotification.notify).not.toHaveBeenCalled()

    expect(result.details[0]!.action).toBe('BONUS_ZERO_SKIP')
    expect(result.processed).toBe(1)
  })
})
