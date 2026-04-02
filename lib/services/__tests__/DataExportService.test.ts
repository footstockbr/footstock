// ============================================================================
// Foot Stock — Testes unitários: DataExportService
// Cobre: processExportJob, collectUserData, toCsv, createZip, positions.csv
// Rastreabilidade: TASK-6/GAP-03
// ============================================================================

// ─── Mock: prisma ────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-test-123',
  name: 'Teste LGPD',
  email: 'teste@footstock.com.br',
  phone: '+5511999999999',
  birthDate: new Date('1995-06-15'),
  favoriteClub: 'flamengo',
  investorProfile: 'MODERADO',
  planType: 'CRAQUE',
  createdAt: new Date('2026-01-01'),
  fsBalance: 15000.50,
}

const mockOrders = [
  { id: 'ord-1', type: 'MARKET', side: 'BUY', status: 'EXECUTED', quantity: 10, price: 25.5, createdAt: new Date() },
]

const mockPositions = [
  { id: 'pos-1', assetId: 'asset-fla', quantity: 50, avgPrice: 22.0, totalInvested: 1100 },
]

const mockTransactions = [
  { id: 'tx-1', type: 'TRADE', side: 'BUY', quantity: 10, price: 25.5, fee: 0, createdAt: new Date() },
]

const mockSubscriptions = [
  { id: 'sub-1', planType: 'CRAQUE', status: 'ACTIVE', startsAt: new Date(), expiresAt: new Date() },
]

const mockConsents = [
  { purpose: 'essential', granted: true, grantedAt: new Date(), revokedAt: null, isRevocable: false, updatedAt: new Date() },
  { purpose: 'analytics', granted: false, grantedAt: null, revokedAt: null, isRevocable: true, updatedAt: new Date(0) },
]

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
    },
    position: {
      findMany: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
    },
    subscription: {
      findMany: jest.fn(),
    },
    dataExportJob: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/ConsentService', () => ({
  consentService: {
    getConsents: jest.fn(),
  },
}))

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('test')),
}))

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'email-1' }) },
  })),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { consentService: mockConsentService } = require('@/lib/services/ConsentService')

import { dataExportService, collectUserData } from '../DataExportService'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-test-123'
const JOB_ID = 'job-test-456'

function setupDefaultMocks() {
  mockPrisma.user.findUnique
    .mockResolvedValueOnce(mockUser) // collectUserData profile
    .mockResolvedValueOnce({ fsBalance: mockUser.fsBalance, planType: mockUser.planType }) // collectUserData financial
    .mockResolvedValueOnce({ email: mockUser.email }) // processExportJob email lookup
  mockPrisma.order.findMany.mockResolvedValue(mockOrders)
  mockPrisma.position.findMany.mockResolvedValue(mockPositions)
  mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions)
  mockPrisma.subscription.findMany.mockResolvedValue(mockSubscriptions)
  mockConsentService.getConsents.mockResolvedValue(mockConsents)
  mockPrisma.dataExportJob.update.mockResolvedValue({})
  mockPrisma.dataExportJob.findUniqueOrThrow.mockResolvedValue({ id: JOB_ID, userId: USER_ID })
}

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('DataExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  describe('collectUserData', () => {
    test('retorna todas as 7 categorias de dados', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ fsBalance: mockUser.fsBalance, planType: mockUser.planType })
      mockPrisma.order.findMany.mockResolvedValue(mockOrders)
      mockPrisma.position.findMany.mockResolvedValue(mockPositions)
      mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions)
      mockPrisma.subscription.findMany.mockResolvedValue(mockSubscriptions)
      mockConsentService.getConsents.mockResolvedValue(mockConsents)

      const data = await collectUserData(USER_ID)

      expect(data).toHaveProperty('profile')
      expect(data).toHaveProperty('financial')
      expect(data).toHaveProperty('orders')
      expect(data).toHaveProperty('positions')
      expect(data).toHaveProperty('transactions')
      expect(data).toHaveProperty('subscriptions')
      expect(data).toHaveProperty('consents')
    })

    test('exclui cpfHash e passwordHash do profile (LGPD)', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ fsBalance: mockUser.fsBalance, planType: mockUser.planType })
      mockPrisma.order.findMany.mockResolvedValue([])
      mockPrisma.position.findMany.mockResolvedValue([])
      mockPrisma.transaction.findMany.mockResolvedValue([])
      mockPrisma.subscription.findMany.mockResolvedValue([])
      mockConsentService.getConsents.mockResolvedValue([])

      const data = await collectUserData(USER_ID)

      // O select do Prisma não inclui cpfHash — verificar que não está no resultado
      expect(data.profile).not.toHaveProperty('cpfHash')
      expect(data.profile).not.toHaveProperty('passwordHash')
      expect(data.profile).toHaveProperty('email')
      expect(data.profile).toHaveProperty('name')
    })

    test('retorna arrays vazios para usuario sem transacoes', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ fsBalance: mockUser.fsBalance, planType: mockUser.planType })
      mockPrisma.order.findMany.mockResolvedValue([])
      mockPrisma.position.findMany.mockResolvedValue([])
      mockPrisma.transaction.findMany.mockResolvedValue([])
      mockPrisma.subscription.findMany.mockResolvedValue([])
      mockConsentService.getConsents.mockResolvedValue([])

      const data = await collectUserData(USER_ID)

      expect(data.orders).toEqual([])
      expect(data.positions).toEqual([])
      expect(data.transactions).toEqual([])
    })

    test('inclui positions no resultado para ZIP', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ fsBalance: mockUser.fsBalance, planType: mockUser.planType })
      mockPrisma.order.findMany.mockResolvedValue(mockOrders)
      mockPrisma.position.findMany.mockResolvedValue(mockPositions)
      mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions)
      mockPrisma.subscription.findMany.mockResolvedValue(mockSubscriptions)
      mockConsentService.getConsents.mockResolvedValue(mockConsents)

      const data = await collectUserData(USER_ID)

      expect(data.positions).toHaveLength(1)
      expect(data.positions[0]).toHaveProperty('assetId', 'asset-fla')
    })
  })

  describe('processExportJob', () => {
    test('atualiza status para PROCESSING e depois COMPLETED', async () => {
      setupDefaultMocks()
      process.env.RESEND_API_KEY = 'test-key'

      await dataExportService.processExportJob(JOB_ID)

      // Primeira chamada: PROCESSING
      expect(mockPrisma.dataExportJob.update).toHaveBeenNthCalledWith(1, {
        where: { id: JOB_ID },
        data: { status: 'PROCESSING' },
      })

      // Última chamada: COMPLETED com filePath, downloadUrl, expiresAt
      const lastCall = mockPrisma.dataExportJob.update.mock.calls.at(-1)![0]
      expect(lastCall.data.status).toBe('COMPLETED')
      expect(lastCall.data.filePath).toBeDefined()
      expect(lastCall.data.downloadUrl).toBeDefined()
      expect(lastCall.data.expiresAt).toBeInstanceOf(Date)
      expect(lastCall.data.completedAt).toBeInstanceOf(Date)
    })

    test('atualiza status para FAILED em caso de erro', async () => {
      mockPrisma.dataExportJob.update.mockResolvedValue({})
      mockPrisma.dataExportJob.findUniqueOrThrow.mockRejectedValue(new Error('DB connection lost'))

      await dataExportService.processExportJob(JOB_ID)

      const lastCall = mockPrisma.dataExportJob.update.mock.calls.at(-1)![0]
      expect(lastCall.data.status).toBe('FAILED')
      expect(lastCall.data.error).toContain('DB connection lost')
    })

    test('sem RESEND_API_KEY: job completa sem enviar email', async () => {
      setupDefaultMocks()
      // RESEND_API_KEY não definido

      await dataExportService.processExportJob(JOB_ID)

      const lastCall = mockPrisma.dataExportJob.update.mock.calls.at(-1)![0]
      expect(lastCall.data.status).toBe('COMPLETED')
    })

    test('downloadUrl inclui nome do arquivo ZIP', async () => {
      setupDefaultMocks()

      await dataExportService.processExportJob(JOB_ID)

      const lastCall = mockPrisma.dataExportJob.update.mock.calls.at(-1)![0]
      expect(lastCall.data.downloadUrl).toContain('export-')
      expect(lastCall.data.downloadUrl).toContain('.zip')
    })
  })
})
