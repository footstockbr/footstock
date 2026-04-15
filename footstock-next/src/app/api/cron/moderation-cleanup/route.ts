// ============================================================================
// Foot Stock — /api/cron/moderation-cleanup
// Cron: a cada 24h (recomendado 0 3 * * * UTC = 00:00 BRT)
// Hard-deleta posts reprovados (isDeleted=true) com mais de 10 dias
// Autenticado por CRON_SECRET
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

const RETENTION_DAYS = 10
const BATCH_SIZE = 500

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

    let totalDeleted = 0

    // Process in batches to avoid OOM on large datasets
    while (true) {
      const batch = await prisma.globalForumPost.findMany({
        where: {
          isDeleted: true,
          updatedAt: { lt: cutoffDate },
        },
        select: { id: true },
        take: BATCH_SIZE,
      })

      if (batch.length === 0) break

      const batchIds = batch.map(p => p.id)

      const deleted = await prisma.globalForumPost.deleteMany({
        where: { id: { in: batchIds } },
      })

      totalDeleted += deleted.count

      // If we got fewer than BATCH_SIZE, we're done
      if (batch.length < BATCH_SIZE) break
    }

    console.log(
      `[cron/moderation-cleanup] Deletados ${totalDeleted} posts reprovados (cutoff: ${cutoffDate.toISOString()})`
    )

    return NextResponse.json({
      success: true,
      report: {
        deletedCount: totalDeleted,
        cutoffDate: cutoffDate.toISOString(),
        retentionDays: RETENTION_DAYS,
      },
    })
  } catch (error) {
    console.error('[cron/moderation-cleanup] Erro:', error)
    return NextResponse.json(
      { success: false, error: 'Erro interno no cleanup de moderacao' },
      { status: 500 }
    )
  }
}
