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
      createdAt: true,
    },
  })

  // Contas suspensas/banidas (proxy para exclusao — nao existe soft-delete no schema)
  const suspendedUsers = await prisma.user.findMany({
    where: { status: { in: [USER_STATUS.SUSPENDED, USER_STATUS.BANNED] } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { id: true, email: true, updatedAt: true, status: true },
  })

  const deletions = suspendedUsers.map((u) => ({
    id: u.id,
    email: u.email,
    deletedAt: u.updatedAt.toISOString(),
    reason: u.status === USER_STATUS.BANNED ? 'Conta banida' : 'Conta suspensa',
  }))

  // Indicadores de retencao
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const [logsOlder30d, exportsOlder90d, inactiveUsers] = await Promise.all([
    prisma.dataAccessLog.count({ where: { createdAt: { lt: thirtyDaysAgo } } }),
    prisma.dataExportJob.count({ where: { createdAt: { lt: ninetyDaysAgo }, status: 'COMPLETED' } }),
    prisma.user.count({ where: { updatedAt: { lt: ninetyDaysAgo }, status: USER_STATUS.ACTIVE } }),
  ])

  const retention = [
    { label: 'Logs de acesso > 30 dias', count: logsOlder30d, policy: 'Recomendado: purgar apos 90 dias' },
    { label: 'Exports completados > 90 dias', count: exportsOlder90d, policy: 'Recomendado: remover arquivos' },
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
