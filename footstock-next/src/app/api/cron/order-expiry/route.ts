// ============================================================================
// Foot Stock — /api/cron/order-expiry (0 6 * * *)
// Expira ordens LIMIT/OCO/SCHEDULED com mais de 30 dias.
// Autenticado por CRON_SECRET — resposta 401 silenciosa se inválido.
// Rastreabilidade: INT-012, INT-013 / TASK-3/ST004
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { processExpiredOrders } from '@/lib/jobs/order-expiry'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const result = await processExpiredOrders()

    return NextResponse.json({
      success: true,
      expired: result.expired,
      tickers: result.tickers,
      processedAt: result.processedAt,
    })
  } catch (err) {
    console.error('[cron/order-expiry] Erro:', err)
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}
