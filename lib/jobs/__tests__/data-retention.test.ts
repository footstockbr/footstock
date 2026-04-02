// ============================================================================
// Foot Stock — Testes unitários: data-retention job
// Cobre: 90-day cutoff, financial guardrail, export cleanup, idempotência
// Rastreabilidade: TASK-5/GAP-04
// ============================================================================

jest.mock('@/lib/prisma', () => ({
  prisma: {
    dataAccessLog: { deleteMany: jest.fn() },
    dataExportJob: { deleteMany: jest.fn() },
    webhookAuditLog: { deleteMany: jest.fn() },
    transaction: { count: jest.fn() },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

import { runDataRetentionJob } from '../data-retention'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runDataRetentionJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.dataAccessLog.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.dataExportJob.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.webhookAuditLog.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.transaction.count.mockResolvedValue(42)
  })

  test('retorna relatório com todos os campos', async () => {
    mockPrisma.dataAccessLog.deleteMany.mockResolvedValue({ count: 5 })
    mockPrisma.dataExportJob.deleteMany.mockResolvedValue({ count: 2 })
    mockPrisma.webhookAuditLog.deleteMany.mockResolvedValue({ count: 3 })

    const report = await runDataRetentionJob()

    expect(report.deletedAccessLogs).toBe(5)
    expect(report.deletedExportJobs).toBe(2)
    expect(report.deletedWebhookLogs).toBe(3)
    expect(report.keptFinancialRecords).toBe(42)
    expect(report.timestamp).toBeDefined()
  })

  test('deleta access logs com cutoff 90 dias', async () => {
    await runDataRetentionJob()

    const call = mockPrisma.dataAccessLog.deleteMany.mock.calls[0][0]
    const cutoff = new Date(call.where.createdAt.lt)
    const daysAgo = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000)

    expect(daysAgo).toBeGreaterThanOrEqual(89.9)
    expect(daysAgo).toBeLessThanOrEqual(90.1)
  })

  test('deleta export jobs expirados com status COMPLETED', async () => {
    await runDataRetentionJob()

    const call = mockPrisma.dataExportJob.deleteMany.mock.calls[0][0]
    expect(call.where.status).toBe('COMPLETED')
    expect(call.where.expiresAt.lt).toBeDefined()
  })

  test('deleta webhook logs com cutoff 90 dias via processedAt', async () => {
    await runDataRetentionJob()

    const call = mockPrisma.webhookAuditLog.deleteMany.mock.calls[0][0]
    expect(call.where.processedAt).toBeDefined()
    expect(call.where.processedAt.lt).toBeDefined()
  })

  test('GUARDRAIL: nunca deleta transactions', async () => {
    await runDataRetentionJob()

    // transaction.count é chamado para verificação, mas deleteMany NUNCA é chamado
    expect(mockPrisma.transaction.count).toHaveBeenCalled()
    // prisma.transaction NÃO tem deleteMany mockado — qualquer chamada falharia
  })

  test('idempotente: sem registros para deletar retorna zeros', async () => {
    const report = await runDataRetentionJob()

    expect(report.deletedAccessLogs).toBe(0)
    expect(report.deletedExportJobs).toBe(0)
    expect(report.deletedWebhookLogs).toBe(0)
    expect(report.keptFinancialRecords).toBe(42)
  })

  test('timestamp é ISO string válida', async () => {
    const report = await runDataRetentionJob()
    expect(() => new Date(report.timestamp)).not.toThrow()
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp)
  })
})
