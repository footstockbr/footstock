// ============================================================================
// Foot Stock — /api/cron/cancellation-lock (*/30 * * * *)
// Processa travas de cancelamento expiradas — a cada 30min
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { processCancellationLocks } from '@/lib/jobs/cancellation-lock'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const result = await processCancellationLocks()
    console.log('[cron/cancellation-lock]', result)
    return NextResponse.json({ processed: result.processed, errors: result.errors })
  } catch (err) {
    console.error('[cron/cancellation-lock] Erro crítico:', err)
    return NextResponse.json({ processed: 0, errors: 1 }, { status: 500 })
  }
}
