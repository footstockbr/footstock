// ============================================================================
// Foot Stock — /api/v1/admin/lgpd/dashboard
// Dados agregados para o DPO Dashboard (LGPD).
// Protegido por withAdmin('admin:audit').
// Rastreabilidade: G023
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { USER_STATUS } from '@/lib/enums'

async function handler(_req: NextRequest) {
  // Consentimentos ativos vs revogados
  const [activeConsents, revokedConsents] = await Promise.all([
    prisma.consent.count({ where: { granted: true, revokedAt: null } }),
    prisma.consent.count({ where: { revokedAt: { not: null } } }),
  ])

  // Exportacoes por status
  const [pendingExports, completedExports, failedExports] = await Promise.all([
    prisma.dataExportJob.count({ where: { status: 'PENDING' } }),
    prisma.dataExportJob.count({ where: { status: 'COMPLETED' } }),
    prisma.dataExportJob.count({ where: { status: 'FAILED' } }),
  ])

  // Ultimos 50 acessos a PII
  const accessLogs = await prisma.dataAccessLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      userId: true,
      accessedBy: true,
      dataType: true,
      endpoint: true,
      reason: true,
      ipAddress: true,
      createdAt: true,
    },
  })

  // Exclusoes LGPD Art. 18 (anonimizacoes via account-deletion.ts)
  const lgpdDeletions = await prisma.dataAccessLog.findMany({
    where: { dataType: 'ACCOUNT_DELETION' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, userId: true, reason: true, createdAt: true },
  })

  // Contas suspensas/banidas por admin
  const suspendedUsers = await prisma.user.findMany({
    where: { status: { in: [USER_STATUS.SUSPENDED, USER_STATUS.BANNED] } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { id: true, email: true, updatedAt: true, status: true },
  })

  const deletions = [
    ...lgpdDeletions.map((d) => ({
      id: d.id,
      email: 'Anonimizado (Art. 18)',
      deletedAt: d.createdAt.toISOString(),
      reason: d.reason ?? 'Solicitacao LGPD Art. 18',
      type: 'lgpd_deletion' as const,
    })),
    ...suspendedUsers.map((u) => ({
      id: u.id,
      email: u.email,
      deletedAt: u.updatedAt.toISOString(),
      reason: u.status === USER_STATUS.BANNED ? 'Conta banida' : 'Conta suspensa',
      type: (u.status === USER_STATUS.BANNED ? 'banned' : 'suspended') as 'banned' | 'suspended',
    })),
  ].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())

  // Indicadores de retencao (thresholds alinhados com data-retention.ts)
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const [logsOlder90d, exportsExpired, inactiveUsers] = await Promise.all([
    prisma.dataAccessLog.count({ where: { createdAt: { lt: ninetyDaysAgo } } }),
    prisma.dataExportJob.count({ where: { expiresAt: { lt: now }, status: 'COMPLETED' } }),
    prisma.user.count({ where: { updatedAt: { lt: ninetyDaysAgo }, status: USER_STATUS.ACTIVE } }),
  ])

  const retention = [
    { label: 'Logs de acesso > 90 dias', count: logsOlder90d, policy: 'Politica: purgar automaticamente (LGPD Art. 16)' },
    { label: 'Exports expirados (> 7 dias)', count: exportsExpired, policy: 'Politica: remover arquivos expirados' },
    { label: 'Usuarios inativos > 90 dias', count: inactiveUsers, policy: 'Recomendado: notificar ou anonimizar' },
  ]

  return NextResponse.json({
    consents: { active: activeConsents, revoked: revokedConsents },
    exports: { pending: pendingExports, completed: completedExports, failed: failedExports },
    accessLogs,
    deletions,
    retention,
  })
}

export const GET = withAdmin('admin:audit')(handler)
