import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'
import { dataExportService } from '@/lib/services/DataExportService'

// GET /api/v1/users/me/export?format=json|csv — Portabilidade LGPD Art. 18
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const format = (request.nextUrl.searchParams.get('format') ?? 'json') as string

  try {
    // Rate limit: 1 exportação por 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentJob = await prisma.dataExportJob.findFirst({
      where: {
        userId: auth.user.id,
        createdAt: { gte: oneDayAgo },
        status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
      },
    })

    if (recentJob) {
      return NextResponse.json(
        {
          error: {
            code: 'LGPD_RATE_001',
            message: 'Você já solicitou uma exportação nas últimas 24 horas.',
            jobId: recentJob.id,
          },
        },
        { status: 429 }
      )
    }

    // Criar job de exportação
    const job = await prisma.dataExportJob.create({
      data: {
        userId: auth.user.id,
        status: 'PENDING',
        format: format === 'csv' ? 'csv' : 'json+csv',
      },
    })

    // Registrar no log de acesso
    await prisma.dataAccessLog.create({
      data: {
        userId: auth.user.id,
        accessedBy: auth.user.id,
        dataType: 'full_export',
        endpoint: '/api/v1/users/me/export',
        reason: 'DATA_EXPORT_REQUEST',
      },
    }).catch(() => undefined)

    // Processar em background após resposta enviada (Next.js after())
    const jobId = job.id
    after(async () => {
      await dataExportService.processExportJob(jobId)
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          jobId: job.id,
          message: 'Exportação iniciada. Você receberá um email quando estiver pronta.',
          estimatedTime: 'alguns minutos',
        },
      },
      { status: 202 }
    )
  } catch {
    return errors.server()
  }
}
