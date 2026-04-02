// ============================================================================
// Foot Stock — Testes unitarios: SubscriptionService
// ============================================================================

import { SubscriptionService } from '../SubscriptionService'

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeDbSubscription(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    id: 'sub-001',
    userId: 'user-1',
    planType: 'CRAQUE',
    status: 'ACTIVE',
    startsAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 dias atras
    expiresAt: new Date(now.getTime() + 27 * 24 * 60 * 60 * 1000),
    gateway: 'mercadopago',
    period: 'MONTHLY',
    amount: 1990,
    cancelledAt: null,
    cancellationLockExpiresAt: null,
    bonusScheduledAt: null,
    bonusCreditedAt: null,
    refundRequested: false,
    createdAt: new Date(),
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SubscriptionService', () => {
  let service: SubscriptionService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new SubscriptionService()
  })

  describe('getCurrentSubscription', () => {
    test('retorna null quando nao ha subscription ativa', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null)

      const result = await service.getCurrentSubscription('user-1')
      expect(result).toBeNull()
    })

    test('retorna subscription com campos calculados', async () => {
      const sub = makeDbSubscription()
      mockPrisma.subscription.findFirst.mockResolvedValue(sub)

      const result = await service.getCurrentSubscription('user-1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('sub-001')
      expect(result!.planType).toBe('CRAQUE')
      expect(result!.isEligibleForRefund).toBe(true) // 3 dias < 7 dias
      expect(typeof result!.daysUntilExpiry).toBe('number')
    })

    test('inclui cancellationLock quando status e CANCELLATION_LOCK', async () => {
      const lockExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h no futuro
      const sub = makeDbSubscription({
        planType: 'LENDA',
        status: 'CANCELLATION_LOCK',
        cancellationLockExpiresAt: lockExpiry,
      })
      mockPrisma.subscription.findFirst.mockResolvedValue(sub)

      const result = await service.getCurrentSubscription('user-1')

      expect(result!.cancellationLock).not.toBeNull()
      expect(result!.cancellationLock!.requiresLiquidation).toBe(true) // LENDA -> JOGADOR tem restricoes
      expect(result!.cancellationLock!.hoursRemaining).toBeGreaterThan(0)
    })
  })

  describe('cancelSubscription', () => {
    test('dentro do cooling off: cancela com reembolso', async () => {
      const now = new Date()
      const sub = makeDbSubscription({
        startsAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 dias
      })
      mockPrisma.subscription.findFirst.mockResolvedValue(sub)
      mockPrisma.subscription.update.mockResolvedValue(sub)

      const result = await service.cancelSubscription('user-1')

      expect(result.isEligibleForRefund).toBe(true)
      expect(result.requiresLiquidation).toBe(false)
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refundRequested: true }),
        })
      )
    })

    test('fora do cooling off: entra em CANCELLATION_LOCK', async () => {
      const now = new Date()
      const sub = makeDbSubscription({
        startsAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000), // 15 dias atras
      })
      mockPrisma.subscription.findFirst.mockResolvedValue(sub)
      mockPrisma.subscription.update.mockResolvedValue(sub)

      const result = await service.cancelSubscription('user-1')

      expect(result.isEligibleForRefund).toBe(false)
      expect(result.cancellationLock).toBeDefined()
      expect(result.cancellationLock!.hoursRemaining).toBe(48)
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CANCELLATION_LOCK' }),
        })
      )
    })

    test('rejeita se nao encontrar subscription ativa', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null)

      await expect(service.cancelSubscription('user-1')).rejects.toThrow('Assinatura não encontrada')
    })
  })

  describe('createSubscription', () => {
    test('cria subscription com status PENDING', async () => {
      const input = {
        userId: 'user-1',
        planType: 'CRAQUE' as const,
        gateway: 'mercadopago',
        period: 'MONTHLY',
        amount: 1990,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }
      mockPrisma.user.findUnique.mockResolvedValue({ adminRole: null })
      mockPrisma.subscription.create.mockResolvedValue({ id: 'sub-new', ...input, status: 'PENDING' })

      const result = await service.createSubscription(input)

      expect(result.status).toBe('PENDING')
      expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', amount: 1990 }),
        })
      )
    })
  })

  describe('activateSubscription', () => {
    test('atualiza status para ACTIVE', async () => {
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' })

      await service.activateSubscription('sub-1')

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'ACTIVE' },
      })
    })
  })
})
