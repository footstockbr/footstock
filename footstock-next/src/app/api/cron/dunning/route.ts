// ============================================================================
// FootStock — /api/cron/dunning (0 4 * * *)
// Retentativas automáticas D+1/D+3/D+7 + limpeza de logs de webhook (90 dias)
// Autenticado por CRON_SECRET — resposta 401 silenciosa se inválido
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { dunningService } from '@/lib/services/DunningService'
import { webhookAuditService } from '@/lib/services/WebhookAuditService'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const [dunningResult, pruneResult] = await Promise.all([
      dunningService.processDunning(),
      webhookAuditService.pruneOldLogs(),
    ])

    console.log('[cron/dunning]', {
      dunning: { processed: dunningResult.processed, errors: dunningResult.errors },
      pruned: pruneResult,
    })

    return NextResponse.json({
      dunning: {
        processed: dunningResult.processed,
        errors: dunningResult.errors,
        details: dunningResult.details,
      },
      pruned: pruneResult,
    })
  } catch (err) {
    console.error('[cron/dunning] Erro crítico:', err)
    return NextResponse.json({ processed: 0, errors: 1 }, { status: 500 })
  }
}
