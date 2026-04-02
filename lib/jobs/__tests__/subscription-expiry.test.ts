// ============================================================================
// Foot Stock — Testes unitários: job subscription-expiry
// Cobre: processExpiredSubscriptions, processRenewalReminders, processCancelledSubscriptions
// ============================================================================

import {
  processExpiredSubscriptions,
  processRenewalReminders,
  processCancelledSubscriptions,
} from '../subscription-expiry'

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

// ─── Mock: plan-logic ────────────────────────────────────────────────────────

jest.mock('@/lib/services/plan-logic', () => ({
  shouldSuspendAccount:    jest.fn(),
  shouldDowngradeToJogador: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const planLogic = require('@/lib/services/plan-logic')

// ─── Helpers ─────────────────────────────────────────────────────────────────

const now = new Date()

/** Subscription ativa com expiresAt no passado */
function makeExpiredActiveSub(overrides: Record<string, unknown> = {}) {
  return {
    id:                        'sub-exp-1',
    userId:                    'user-1',
    planType:                  'CRAQUE',
    startsAt:                  new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
    expiresAt:                 new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // expirou 2 dias atrás
    status:                    'ACTIVE',
    cancelledAt:               null,
    cancellationLockExpiresAt: null,
    ...overrides,
  }
}

/** Subscription EXPIRED/SUSPENDED com expiresAt há mais de 7 dias */
function makeExpiredSuspendedSub(overrides: Record<string, unknown> = {}) {
  return {
    id:                        'sub-exp-2',
    userId:                    'user-2',
    planType:                  'CRAQUE',
    startsAt:                  new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
    expiresAt:                 new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // expirou 10 dias atrás
    status:                    'EXPIRED',
    cancelledAt:               null,
    cancellationLockExpiresAt: null,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('processExpiredSubscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.$transaction.mockResolvedValue(undefined)
    mockPrisma.subscription.update.mockResolvedValue({})
    mockPrisma.user.update.mockResolvedValue({})
  })

  // ────────────────────────────────────────────────────────────────────────────
  test('subscription ativa expirada: executa $transaction(EXPIRED + SUSPENDED) e notifica', async () => {
    const sub = makeExpiredActiveSub()
    // Primeiro findMany: subscriptions ativas expiradas; segundo: para downgrade (vazio para não interferir)
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub]) // expired actives
      .mockResolvedValueOnce([])    // to downgrade

    // shouldSuspendAccount = true → deve suspender
    planLogic.shouldSuspendAccount.mockReturnValue(true)
    planLogic.shouldDowngradeToJogador.mockReturnValue(false)

    const result = await processExpiredSubscriptions()

    // Deve ter chamado $transaction para suspender
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)

    // Deve notificar com PLAN_CANCEL_ALERT reason=expired
    expect(mockNotification.notify).toHaveBeenCalledWith(
      'user-1',
      'PLAN_CANCEL_ALERT',
      expect.objectContaining({ reason: 'expired', planName: 'CRAQUE' })
    )

    expect(result.details[0]!.action).toBe('SUSPENDED')
    expect(result.processed).toBe(1)
    expect(result.errors).toBe(0)
  })

  // ────────────────────────────────────────────────────────────────────────────
  test('subscription suspensa há 7+ dias: executa $transaction(CANCELLED + downgrade JOGADOR)', async () => {
    const sub = makeExpiredSuspendedSub()
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([]) // sem expirados ativos nesta rodada
      .mockResolvedValueOnce([sub]) // sub a fazer downgrade

    planLogic.shouldSuspendAccount.mockReturnValue(false)
    planLogic.shouldDowngradeToJogador.mockReturnValue(true)

    const result = await processExpiredSubscriptions()

    // Deve ter chamado $transaction para downgrade
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)

    // Notificação com reason=downgraded
    expect(mockNotification.notify).toHaveBeenCalledWith(
      'user-2',
      'PLAN_CANCEL_ALERT',
      expect.objectContaining({ reason: 'downgraded', planName: 'CRAQUE' })
    )

    expect(result.details[0]!.action).toBe('DOWNGRADED_TO_JOGADOR')
    expect(result.processed).toBe(1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('processRenewalReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.subscription.update.mockResolvedValue({})
  })

  test('subscription ativa vencendo em 5 dias com renewalReminderSentAt null → update + notifica', async () => {
    const expiresAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
    const sub = {
      id:       'sub-reminder-1',
      userId:   'user-3',
      planType: 'CRAQUE',
      expiresAt,
    }
    // renewalReminderSentAt null é garantido pelo WHERE (não retornado se preenchido)
    mockPrisma.subscription.findMany.mockResolvedValue([sub])

    const result = await processRenewalReminders()

    // Deve atualizar renewalReminderSentAt
    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-reminder-1' },
        data:  expect.objectContaining({ renewalReminderSentAt: expect.any(Date) }),
      })
    )

    // Deve notificar com isRenewalReminder=true
    expect(mockNotification.notify).toHaveBeenCalledWith(
      'user-3',
      'PLAN_CANCEL_ALERT',
      expect.objectContaining({ isRenewalReminder: true, planType: 'CRAQUE' })
    )

    expect(result.processed).toBe(1)
    expect(result.errors).toBe(0)
    // Action deve incluir dias até expirar (ex: RENEWAL_REMINDER_D-5)
    expect(result.details[0]!.action).toMatch(/^RENEWAL_REMINDER_D-\d+$/)
  })

  test('idempotência: renewalReminderSentAt preenchido não é retornado (WHERE null)', async () => {
    // WHERE renewalReminderSentAt: null no findMany garante que subscriptions já notificadas
    // nunca chegam aqui — simulamos retornando lista vazia
    mockPrisma.subscription.findMany.mockResolvedValue([])

    const result = await processRenewalReminders()

    expect(mockPrisma.subscription.update).not.toHaveBeenCalled()
    expect(mockNotification.notify).not.toHaveBeenCalled()
    expect(result.processed).toBe(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('processCancelledSubscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.$transaction.mockResolvedValue(undefined)
  })

  test('subscription cancelada com expiresAt passado: executa $transaction(CANCELLED + downgrade)', async () => {
    const sub = {
      id:       'sub-cancelled-1',
      userId:   'user-4',
      planType: 'CRAQUE',
      expiresAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // expirou ontem
    }
    // cancelledAt not null + expiresAt passado + status não CANCELLED (garantido pelo WHERE)
    mockPrisma.subscription.findMany.mockResolvedValue([sub])

    const result = await processCancelledSubscriptions()

    // Deve executar $transaction finalizando a subscription
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    const transactionArgs: unknown[] = mockPrisma.$transaction.mock.calls[0][0]
    expect(transactionArgs).toHaveLength(2)

    expect(result.details[0]!.action).toBe('CANCELLED_FINALIZED')
    expect(result.processed).toBe(1)
    expect(result.errors).toBe(0)
  })

  test('sem subscriptions canceladas pendentes: não executa nenhuma $transaction', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([])

    const result = await processCancelledSubscriptions()

    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(result.processed).toBe(0)
  })
})
