// ============================================================================
// Foot Stock — GET /api/v1/users/me/export/status
// Consulta o status do último job de export do usuário.
// Rastreabilidade: INT-103, TASK-2/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

async function handler(_req: NextRequest, { user }: AuthContext) {
  const job = await prisma.dataExportJob.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      downloadUrl: true,
      expiresAt: true,
    },
  })

  if (!job) {
    return NextResponse.json(
      { status: null, message: 'Nenhuma solicitação encontrada.' },
      { status: 200 }
    )
  }

  return NextResponse.json({
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    downloadUrl: job.downloadUrl,
    expiresAt: job.expiresAt,
  })
}

export const GET = withAuth(handler as never)
