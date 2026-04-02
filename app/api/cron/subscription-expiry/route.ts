// ============================================================================
// Foot Stock — /api/cron/subscription-expiry (0 2 * * *)
// Autenticado por CRON_SECRET — resposta 401 silenciosa se inválido
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import {
  processExpiredSubscriptions,
  processCancelledSubscriptions,
  processRenewalReminders,
} from '@/lib/jobs/subscription-expiry'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const [expiredResult, cancelledResult, reminderResult] = await Promise.all([
      processExpiredSubscriptions(),
      processCancelledSubscriptions(),
      processRenewalReminders(),
    ])

    const totalProcessed = expiredResult.processed + cancelledResult.processed + reminderResult.processed
    const totalErrors = expiredResult.errors + cancelledResult.errors + reminderResult.errors

    console.log('[cron/subscription-expiry]', { totalProcessed, totalErrors })

    return NextResponse.json({
      processed: totalProcessed,
      errors: totalErrors,
      details: {
        expired: expiredResult.details,
        cancelled: cancelledResult.details,
        reminders: reminderResult.details,
      },
    })
  } catch (err) {
    console.error('[cron/subscription-expiry] Erro crítico:', err)
    return NextResponse.json({ processed: 0, errors: 1 }, { status: 500 })
  }
}
