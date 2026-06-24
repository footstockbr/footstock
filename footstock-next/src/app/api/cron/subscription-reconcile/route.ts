// GET /api/cron/subscription-reconcile (loop 06-24, Task 008)
// Polling de status de assinatura recorrente: varre subscriptions `recurring` (MERCADO_PAGO) e
// corrige `gatewayStatus`/`status` divergente quando o webhook de mudanca de estado se perdeu.
// Defesa de profundidade do espelho local vs. estado real no provedor — distinto de
// reconcile-payments (recuperacao de pagamento one-time). Auth: Bearer CRON_SECRET (mesmo padrao
// dos demais crons; 401 silencioso quando invalido).

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { subscriptionReconcileService } from '@/lib/services/SubscriptionReconcileService'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(rawLimit) ? rawLimit : 50
  const rawDays = Number(req.nextUrl.searchParams.get('days') ?? 30)
  const sinceDays = Number.isFinite(rawDays) ? rawDays : 30

  try {
    const result = await subscriptionReconcileService.reconcile({ limit, sinceDays })

    console.log('[cron/subscription-reconcile]', {
      processed: result.processed,
      errors: result.errors,
    })

    return NextResponse.json({
      success: result.errors === 0,
      processed: result.processed,
      errors: result.errors,
      details: result.details,
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/subscription-reconcile] Erro critico:', err)
    return NextResponse.json({ success: false, processed: 0, errors: 1, error: String(err) }, { status: 500 })
  }
}
