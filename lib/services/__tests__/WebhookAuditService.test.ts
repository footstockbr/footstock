// ============================================================================
// Foot Stock — Testes unitários: WebhookAuditService
// Cobre: logWebhook (happy path + falha silenciosa), listLogs e pruneOldLogs
// ============================================================================

import { WebhookAuditService, type WebhookAuditInput } from '../WebhookAuditService'

// ─── Mock: prisma ────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    webhookAuditLog: {
      create:     jest.fn(),
      findMany:   jest.fn(),
      count:      jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Input mínimo válido para logWebhook */
function makeAuditInput(overrides: Partial<WebhookAuditInput> = {}): WebhookAuditInput {
  return {
    gateway:       'MERCADO_PAGO',
    eventType:     'payment.updated',
    transactionId: 'txn-123',
    status:        'ACCEPTED',
    hmacValid:     true,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WebhookAuditService', () => {
  let service: WebhookAuditService
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    service = new WebhookAuditService()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('logWebhook', () => {
    test('happy path: persiste log com status ACCEPTED via prisma.webhookAuditLog.create', async () => {
      mockPrisma.webhookAuditLog.create.mockResolvedValue({ id: 'log-1' })

      await service.logWebhook(makeAuditInput())

      expect(mockPrisma.webhookAuditLog.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.webhookAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gateway:       'MERCADO_PAGO',
            eventType:     'payment.updated',
            transactionId: 'txn-123',
            status:        'ACCEPTED',
            hmacValid:     true,
          }),
        })
      )
    })

    test('falha silenciosa: não propaga exceção e faz console.error quando create rejeita', async () => {
      // Simula falha de escrita no banco
      mockPrisma.webhookAuditLog.create.mockRejectedValue(new Error('DB connection timeout'))

      // Não deve lançar exceção (best-effort)
      await expect(service.logWebhook(makeAuditInput())).resolves.toBeUndefined()

      // Deve registrar o erro no console
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('WebhookAuditService'),
        expect.any(Error)
      )
    })

    test('campos opcionais ausentes são gravados como null', async () => {
      mockPrisma.webhookAuditLog.create.mockResolvedValue({ id: 'log-2' })

      // Input sem eventType, transactionId, subscriptionId, ipAddress, errorMessage
      await service.logWebhook({
        gateway:   'PAGSEGURO',
        status:    'REJECTED',
        hmacValid: false,
      })

      expect(mockPrisma.webhookAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType:      null,
            transactionId:  null,
            subscriptionId: null,
            ipAddress:      null,
            errorMessage:   null,
          }),
        })
      )
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('listLogs', () => {
    test('retorna logs paginados com filtros de gateway e status', async () => {
      const fakeLogs = [{ id: 'log-1', gateway: 'MERCADO_PAGO', status: 'ACCEPTED' }]
      mockPrisma.webhookAuditLog.findMany.mockResolvedValue(fakeLogs)
      mockPrisma.webhookAuditLog.count.mockResolvedValue(1)

      const result = await service.listLogs({
        gateway: 'MERCADO_PAGO',
        status:  'ACCEPTED',
        page:    1,
        limit:   10,
      })

      // Deve chamar findMany com filtros corretos
      expect(mockPrisma.webhookAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where:   expect.objectContaining({ gateway: 'MERCADO_PAGO', status: 'ACCEPTED' }),
          skip:    0,
          take:    10,
          orderBy: { processedAt: 'desc' },
        })
      )

      // Deve retornar dados e metadados de paginação
      expect(result.data).toEqual(fakeLogs)
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, pages: 1 })
    })

    test('usa valores padrão quando params não são informados', async () => {
      mockPrisma.webhookAuditLog.findMany.mockResolvedValue([])
      mockPrisma.webhookAuditLog.count.mockResolvedValue(0)

      await service.listLogs()

      // Padrão: page=1, limit=20 → skip=0, take=20
      expect(mockPrisma.webhookAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 })
      )
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('pruneOldLogs', () => {
    test('chama deleteMany com cutoff de 90 dias e retorna count deletado', async () => {
      mockPrisma.webhookAuditLog.deleteMany.mockResolvedValue({ count: 42 })

      const beforeCall = Date.now()
      const deleted = await service.pruneOldLogs()
      const afterCall = Date.now()

      expect(deleted).toBe(42)

      // Verifica que deleteMany foi chamado com processedAt.lt próximo a 90 dias atrás
      expect(mockPrisma.webhookAuditLog.deleteMany).toHaveBeenCalledTimes(1)
      const callArgs = mockPrisma.webhookAuditLog.deleteMany.mock.calls[0][0]
      const cutoffDate: Date = callArgs.where.processedAt.lt
      const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000

      // O cutoff deve estar aproximadamente 90 dias no passado (tolerância de 1 segundo)
      expect(cutoffDate.getTime()).toBeGreaterThanOrEqual(beforeCall - ninetyDaysInMs - 1000)
      expect(cutoffDate.getTime()).toBeLessThanOrEqual(afterCall  - ninetyDaysInMs + 1000)
    })
  })
})
