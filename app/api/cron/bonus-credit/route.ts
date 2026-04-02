// ============================================================================
// Foot Stock — /api/cron/bonus-credit (0 3 * * *)
// Credita bônus FS$ T+7 — autenticado por CRON_SECRET
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { processBonusCredits } from '@/lib/jobs/bonus-credit'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const result = await processBonusCredits()
    console.log('[cron/bonus-credit]', result)
    return NextResponse.json({ processed: result.processed, errors: result.errors })
  } catch (err) {
    console.error('[cron/bonus-credit] Erro crítico:', err)
    return NextResponse.json({ processed: 0, errors: 1 }, { status: 500 })
  }
}
