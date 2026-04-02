// ============================================================================
// Foot Stock — POST /api/v1/users/me/export
// Solicita export assíncrono dos dados pessoais (LGPD Art. 18, V)
// Rate limit: 1 export por 24h por usuário
// Rastreabilidade: INT-103, US-027, TASK-2/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { dataExportService } from '@/lib/services/DataExportService'
import { LGPD_ERRORS } from '@/lib/errors/lgpd-errors'

async function handler(_req: NextRequest, { user }: AuthContext) {
  // Rate limit: 1 export por 24h
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const existing = await prisma.dataExportJob.findFirst({
    where: { userId: user.id, createdAt: { gt: last24h } },
  })

  if (existing) {
    return NextResponse.json(
      { code: LGPD_ERRORS.RATE_LIMIT.code, message: LGPD_ERRORS.RATE_LIMIT.message },
      {
        status: LGPD_ERRORS.RATE_LIMIT.status,
        headers: { 'Retry-After': '86400' },
      }
    )
  }

  const job = await prisma.dataExportJob.create({
    data: { userId: user.id, status: 'PENDING' },
  })

  // Disparar processamento em background (fire-and-forget)
  void dataExportService.processExportJob(job.id)

  return NextResponse.json(
    {
      jobId: job.id,
      estimatedTime: '24 horas',
      message: 'Você receberá seus dados por email em até 24h.',
    },
    { status: 202 }
  )
}

export const POST = withAuth(handler as never)
