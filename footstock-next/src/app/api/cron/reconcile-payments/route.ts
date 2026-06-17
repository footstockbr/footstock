// GET /api/cron/reconcile-payments
// Defesa de profundidade (item 12): recupera pagamentos APROVADOS cujo webhook se perdeu
// (ex.: a janela do bug do manifesto HMAC — webhooks rejeitados no HMAC sao logados SEM
// transaction_id, entao um sweep por audit log nao acha candidatos). Estrategia correta:
// varrer subscriptions PENDING (gateway MERCADO_PAGO) e, para cada, BUSCAR no MP um pagamento
// aprovado por external_reference (= subscriptionId). Se houver, reconciliar via
// PlanService.reconcileApprovedPayment (idempotente: upgradeUser -> ALREADY_ACTIVE, payment.upsert
// por gatewayTransactionId). Auth: Bearer CRON_SECRET (mesmo padrao dos demais crons).

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { planService } from '@/lib/services/PlanService'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayType } from '@/lib/gateways/IGateway'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50
  const rawDays = Number(req.nextUrl.searchParams.get('days') ?? 30)
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(Math.trunc(rawDays), 1), 120) : 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    const pendings = await prisma.subscription.findMany({
      where: { status: 'PENDING', gateway: 'MERCADO_PAGO', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true },
    })

    const gw = getGateway(GatewayType.MERCADO_PAGO) as unknown as {
      searchApprovedPaymentByExternalReference(ref: string): Promise<string | null>
    }

    let activated = 0
    let alreadyActive = 0
    let noApprovedPayment = 0
    const failures: Array<{ subscriptionId: string; reason: string }> = []

    // Sequencial de proposito: limita o ritmo de chamadas ao MP (1 search por subscription).
    for (const sub of pendings) {
      try {
        const paymentId = await gw.searchApprovedPaymentByExternalReference(sub.id)
        if (!paymentId) {
          // Sem pagamento aprovado para esta subscription (intencao de checkout abandonada): ok.
          noApprovedPayment++
          continue
        }
        const result = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, paymentId)
        if (result.ok) {
          if (result.action === 'ACTIVATED') activated++
          else alreadyActive++
        } else {
          failures.push({ subscriptionId: sub.id, reason: result.reason })
        }
      } catch (err) {
        failures.push({ subscriptionId: sub.id, reason: err instanceof Error ? err.message : String(err) })
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      pendingScanned: pendings.length,
      activated,
      alreadyActive,
      noApprovedPayment,
      failed: failures.length,
      failures: failures.slice(0, 20),
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reconcile-payments] Erro:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
