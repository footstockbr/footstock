// ============================================================================
// Foot Stock — Testes unitarios: PlanService
// ============================================================================

import { PlanService } from '../PlanService'

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    subscription: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

jest.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
}))

jest.mock('@/lib/notifications/stubs/NotificationStub', () => ({
  NotificationStub: { notify: jest.fn().mockResolvedValue(undefined) },
}))

// Mock SubscriptionService.createSubscription
jest.mock('../SubscriptionService', () => ({
  subscriptionService: {
    createSubscription: jest.fn().mockResolvedValue({
      id: 'sub-123',
      planType: 'CRAQUE',
      status: 'PENDING',
    }),
  },
}))

// ─── Gateway mock ───────────────────────────────────────────────────────────

jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGateway: jest.fn().mockReturnValue({
    createCheckout: jest.fn().mockResolvedValue({ redirectUrl: 'https://gateway.test/pay' }),
    refundPayment: jest.fn().mockResolvedValue({ refundId: 'refund-1' }),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
  }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockGatewayInstance = require('@/lib/gateways/GatewayFactory').getGateway()

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PlanService', () => {
  let service: PlanService
  const gateway = mockGatewayInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockGatewayInstance.createCheckout.mockResolvedValue({ redirectUrl: 'https://gateway.test/pay' })
    service = new PlanService()
  })

  describe('createCheckout', () => {
    test('happy path: cria checkout para CRAQUE monthly', async () => {
      // Usuario atual e JOGADOR (pode fazer upgrade)
      mockPrisma.user.findUnique.mockResolvedValue({ planType: 'JOGADOR' })
      // Sem subscription ACTIVE existente
      mockPrisma.subscription.findFirst.mockResolvedValue(null)

      const result = await service.createCheckout('user-1', {
        planType: 'CRAQUE',
        period: 'monthly',
        gateway: 'mercadopago',
      })

      expect(result.subscriptionId).toBe('sub-123')
      expect(result.redirectUrl).toBe('https://gateway.test/pay')
      expect(gateway.createCheckout).toHaveBeenCalledTimes(1)
    })

    test('rejeita checkout para plano JOGADOR (gratuito)', async () => {
      await expect(
        service.createCheckout('user-1', {
          planType: 'JOGADOR',
          period: 'monthly',
          gateway: 'mercadopago',
        })
      ).rejects.toThrow()
    })

    test('rejeita downgrade via checkout', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ planType: 'LENDA' })
      mockPrisma.subscription.findFirst.mockResolvedValue(null)

      await expect(
        service.createCheckout('user-1', {
          planType: 'CRAQUE',
          period: 'monthly',
          gateway: 'mercadopago',
        })
      ).rejects.toThrow('Não é possível fazer downgrade via checkout')
    })
  })

  describe('upgradeUser', () => {
    test('happy path: ativa subscription e credita bonus', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-123',
        planType: 'CRAQUE',
        status: 'PENDING',
        amount: 1990,
      })
      mockPrisma.$transaction.mockResolvedValue(undefined)

      await service.upgradeUser('user-1', 'sub-123')

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    })

    test('skip silencioso se subscription ja ACTIVE (idempotencia)', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-123',
        planType: 'CRAQUE',
        status: 'ACTIVE',
      })

      await service.upgradeUser('user-1', 'sub-123')

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('rejeita se subscription nao encontrada', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null)

      await expect(service.upgradeUser('user-1', 'sub-xxx')).rejects.toThrow()
    })
  })

  describe('validateArrependimento', () => {
    test('retorna true se dentro de 7 dias', async () => {
      const now = new Date()
      const startsAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      mockPrisma.subscription.findUnique.mockResolvedValue({
        planType: 'CRAQUE',
        startsAt,
        expiresAt: new Date(now.getTime() + 27 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        cancelledAt: null,
      })

      const result = await service.validateArrependimento('sub-123')
      expect(result).toBe(true)
    })

    test('retorna false se subscription nao encontrada', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null)

      const result = await service.validateArrependimento('sub-xxx')
      expect(result).toBe(false)
    })
  })
})
