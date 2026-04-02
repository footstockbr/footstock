// ============================================================================
// Foot Stock — Testes unitários: DunningService
// Cobre: processDunning (D+1, skip, max tentativas) e cancelDunning
// ============================================================================

import { DunningService } from '../DunningService'

// ─── Mock: prisma ────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription:   { findMany: jest.fn() },
    dunningAttempt: { create: jest.fn(), updateMany: jest.fn() },
    user:           { findUnique: jest.fn() },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

// ─── Mock: env ────────────────────────────────────────────────────────────────

jest.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
}))

// ─── Mock: NotificationStub ──────────────────────────────────────────────────

jest.mock('@/lib/notifications/stubs/NotificationStub', () => ({
  NotificationStub: { notify: jest.fn().mockResolvedValue(undefined) },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NotificationStub: mockNotification } = require('@/lib/notifications/stubs/NotificationStub')

// ─── Mock: GatewayFactory ────────────────────────────────────────────────────

const mockCreateCheckout = jest.fn()

jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGateway: jest.fn(() => ({
    createCheckout: mockCreateCheckout,
  })),
}))

// ─── Mock: constants ─────────────────────────────────────────────────────────
// DUNNING_MAX_ATTEMPTS = 3 (valor real da constante)

jest.mock('@/lib/constants/payment-security', () => ({
  DUNNING_MAX_ATTEMPTS: 3,
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Cria uma subscription expirada com dunningAttempts configurável */
function makeExpiredSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id:              'sub-dunning-1',
    userId:          'user-1',
    planType:        'CRAQUE',
    gateway:         'MERCADO_PAGO',
    amount:          1990,
    period:          'MONTHLY',
    expiresAt:       new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // expirou 2 dias atrás
    dunningAttempts: [],
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DunningService', () => {
  let service: DunningService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new DunningService()
    // Checkout bem-sucedido por padrão
    mockCreateCheckout.mockResolvedValue({ redirectUrl: 'https://gateway.test/renew' })
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'user@test.com' })
    mockPrisma.dunningAttempt.create.mockResolvedValue({ id: 'attempt-1' })
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('processDunning', () => {
    test('D+1: cria DunningAttempt #1 e notifica quando daysSinceExpiry >= 1', async () => {
      // Subscription expirada há 2 dias, sem tentativas anteriores
      const sub = makeExpiredSubscription({ dunningAttempts: [] })
      mockPrisma.subscription.findMany.mockResolvedValue([sub])

      const result = await service.processDunning()

      // Deve ter criado uma tentativa de dunning
      expect(mockPrisma.dunningAttempt.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.dunningAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionId: 'sub-dunning-1',
            attemptNumber:  1,
            status:         'PENDING',
          }),
        })
      )

      // Deve ter notificado o usuário com PAYMENT_FAILED
      expect(mockNotification.notify).toHaveBeenCalledWith(
        'user-1',
        'PAYMENT_FAILED',
        expect.objectContaining({
          attemptNumber: 1,
          planType:      'CRAQUE',
        })
      )

      // Resultado: 1 processado, 0 erros
      expect(result.processed).toBe(1)
      expect(result.errors).toBe(0)
      expect(result.details[0]!.action).toBe('DUNNING_ATTEMPT_1')
    })

    test('skip: subscription com 1 tentativa e daysSinceExpiry < 3 não processa', async () => {
      // Expirou 1 dia atrás — próxima tentativa é D+3, ainda não chegou
      const sub = makeExpiredSubscription({
        expiresAt:       new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        dunningAttempts: [
          { attemptNumber: 1, scheduledAt: new Date(), status: 'PENDING' },
        ],
      })
      mockPrisma.subscription.findMany.mockResolvedValue([sub])

      const result = await service.processDunning()

      // Não deve criar tentativa nem notificar
      expect(mockPrisma.dunningAttempt.create).not.toHaveBeenCalled()
      expect(mockNotification.notify).not.toHaveBeenCalled()

      // Sem processados (a subscription foi skipped)
      expect(result.processed).toBe(0)
      expect(result.errors).toBe(0)
    })

    test('PAYMENT_060: subscription com 3 tentativas registra max e não processa novamente', async () => {
      // 3 tentativas = DUNNING_MAX_ATTEMPTS atingido
      const sub = makeExpiredSubscription({
        dunningAttempts: [
          { attemptNumber: 1, scheduledAt: new Date(), status: 'FAILED' },
          { attemptNumber: 2, scheduledAt: new Date(), status: 'FAILED' },
          { attemptNumber: 3, scheduledAt: new Date(), status: 'PENDING' },
        ],
      })
      mockPrisma.subscription.findMany.mockResolvedValue([sub])

      const result = await service.processDunning()

      // Não deve criar nova tentativa
      expect(mockPrisma.dunningAttempt.create).not.toHaveBeenCalled()
      expect(mockNotification.notify).not.toHaveBeenCalled()

      // Detalhes registram PAYMENT_060_MAX_ATTEMPTS
      expect(result.details[0]!.action).toBe('PAYMENT_060_MAX_ATTEMPTS')
      expect(result.processed).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('cancelDunning', () => {
    test('atualiza todas as tentativas PENDING para FAILED', async () => {
      mockPrisma.dunningAttempt.updateMany.mockResolvedValue({ count: 2 })

      await service.cancelDunning('sub-dunning-1')

      expect(mockPrisma.dunningAttempt.updateMany).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub-dunning-1', status: 'PENDING' },
        data:  expect.objectContaining({ status: 'FAILED' }),
      })
    })
  })
})
