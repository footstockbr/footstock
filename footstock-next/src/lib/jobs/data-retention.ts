// ============================================================================
// Foot Stock — Job: data-retention
// Cron diário (00:00 BRT): aplica política de retenção de dados LGPD
// GUARDRAIL: NUNCA deletar transactions, orders, payments (obrigação fiscal 5 anos)
// Rastreabilidade: INT-108, TASK-3/ST001
// ============================================================================

import { prisma } from '@/lib/prisma'

export interface RetentionReport {
  deletedAccessLogs: number
  deletedExportJobs: number
  deletedWebhookLogs: number
  keptFinancialRecords: number
  timestamp: string
}

/**
 * Executa política de retenção de dados conforme LGPD.
 *
 * Prazos:
 *   - DataAccessLog:   90 dias → deletar
 *   - DataExportJob:   7 dias após conclusão → deletar
 *   - WebhookAuditLog: 90 dias → deletar
 *   - Transactions/Orders/Payments: MANTER (obrigação legal fiscal 5 anos)
 */
export async function runDataRetentionJob(): Promise<RetentionReport> {
  const now = new Date()
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // 1. Deletar logs de acesso > 90 dias
  const { count: deletedAccessLogs } = await prisma.dataAccessLog.deleteMany({
    where: { createdAt: { lt: cutoff90 } },
  })

  // 2. Deletar jobs de export expirados (COMPLETED com expiresAt < now)
  const { count: deletedExportJobs } = await prisma.dataExportJob.deleteMany({
    where: { expiresAt: { lt: now }, status: 'COMPLETED' },
  })

  // 3. Deletar WebhookAuditLog > 90 dias (campo: processedAt)
  const { count: deletedWebhookLogs } = await prisma.webhookAuditLog.deleteMany({
    where: { processedAt: { lt: cutoff90 } },
  })

  // 4. Verificar registros financeiros MANTIDOS (nunca deletar)
  const keptFinancialRecords = await prisma.transaction.count()

  const report: RetentionReport = {
    deletedAccessLogs,
    deletedExportJobs,
    deletedWebhookLogs,
    keptFinancialRecords,
    timestamp: now.toISOString(),
  }

  console.log('[data-retention] Relatório:', JSON.stringify(report))

  return report
}
