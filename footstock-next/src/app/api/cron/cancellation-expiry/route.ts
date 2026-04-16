// ============================================================================
// FootStock — /api/cron/cancellation-expiry (0 5 * * * — diário às 05:00 UTC = 02:00 UTC-3)
// T+7d: cancela definitivamente assinaturas em CANCELLATION_LOCK expiradas
// Encerra TODAS posições, aplica floor FS$0, reseta saldo para FS$2000
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { processCancellationExpiries } from '@/lib/jobs/cancellation-expiry'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const result = await processCancellationExpiries()
    console.log('[cron/cancellation-expiry T+7d]', result)
    return NextResponse.json({ processed: result.processed, errors: result.errors, details: result.details })
  } catch (err) {
    console.error('[cron/cancellation-expiry T+7d] Erro crítico:', err)
    return NextResponse.json({ processed: 0, errors: 1 }, { status: 500 })
  }
}
