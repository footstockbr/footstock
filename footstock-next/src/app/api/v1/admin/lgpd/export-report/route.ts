// ============================================================================
// Foot Stock — /api/v1/admin/lgpd/export-report
// Gera relatorio LGPD em JSON para download pelo DPO.
// Protegido por withAdmin('admin:audit').
// Rastreabilidade: G023
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

async function handler(_req: NextRequest) {
  const [consents, accessLogs, exports, deletedUsers] = await Promise.all([
    prisma.consent.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        purpose: true,
        granted: true,
        grantedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
    prisma.dataAccessLog.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        accessedBy: true,
        dataType: true,
        endpoint: true,
        reason: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    prisma.dataExportJob.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        status: true,
        format: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.user.findMany({
      where: { status: { in: ['SUSPENDED', 'BANNED'] } },
      select: { id: true, email: true, updatedAt: true, status: true },
    }),
  ])

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalConsents: consents.length,
      activeConsents: consents.filter(c => c.granted && !c.revokedAt).length,
      revokedConsents: consents.filter(c => c.revokedAt).length,
      totalAccessLogs: accessLogs.length,
      totalExports: exports.length,
      suspendedAccounts: deletedUsers.length,
    },
    consents,
    accessLogs,
    exports,
    suspendedAccounts: deletedUsers,
  }

  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="lgpd-report-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}

export const POST = withAdmin('admin:audit')(handler)
