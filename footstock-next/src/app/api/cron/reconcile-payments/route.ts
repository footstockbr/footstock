// GET /api/cron/reconcile-payments
// Defesa de profundidade do item 12: recupera pagamentos aprovados que NAO ativaram o plano
// (webhook perdido/rejeitado, ex.: a janela do bug do manifesto HMAC). upgradeUser so roda pelo
// webhook (sem fallback), entao sem este cron um pagamento aprovado cujo webhook falhou deixa o
// usuario em JOGADOR indefinidamente. Estrategia: varrer os logs de webhook REJEITADOS recentes
// do Mercado Pago que tem transactionId e reprocessar cada um via
// planService.reconcileApprovedPayment (idempotente: upgradeUser -> ALREADY_ACTIVE, payment.upsert
// por gatewayTransactionId). Auth: Bearer CRON_SECRET (mesmo padrao dos demais crons).

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { planService } from '@/lib/services/PlanService'
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
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(Math.trunc(rawDays), 1), 90) : 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    // Candidatos: webhooks MP REJEITADOS recentes com transactionId. Dedup por transactionId
    // em JS (um pagamento pode ter varias tentativas rejeitadas).
    const rejected = await prisma.webhookAuditLog.findMany({
      where: {
        gateway: 'MERCADO_PAGO',
        status: 'REJECTED',
        transactionId: { not: null },
        processedAt: { gte: since },
      },
      orderBy: { processedAt: 'desc' },
      select: { transactionId: true },
      take: Math.min(limit * 5, 1000),
    })

    const seen = new Set<string>()
    const candidates: string[] = []
    for (const r of rejected) {
      const tx = r.transactionId
      if (!tx || seen.has(tx)) continue
      seen.add(tx)
      candidates.push(tx)
      if (candidates.length >= limit) break
    }

    let activated = 0
    let alreadyActive = 0
    let skipped = 0
    const failures: Array<{ paymentId: string; reason: string }> = []

    // Sequencial de proposito: limita o ritmo de chamadas ao MP (1 GET /v1/payments por item).
    for (const paymentId of candidates) {
      // Pular se ja existe um Payment PAID com esse id (evita chamada redundante ao MP).
      const paid = await prisma.payment.findFirst({
        where: { gatewayTransactionId: paymentId, status: 'PAID' },
        select: { id: true },
      })
      if (paid) {
        skipped++
        continue
      }

      try {
        const result = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, paymentId)
        if (result.ok) {
          if (result.action === 'ACTIVATED') activated++
          else alreadyActive++
        } else if (result.reason === 'PAYMENT_NOT_APPROVED') {
          // Rejeicao real do gateway (nao foi aprovado): esperado, nao e falha do cron.
          skipped++
        } else {
          failures.push({ paymentId, reason: result.reason })
        }
      } catch (err) {
        failures.push({ paymentId, reason: err instanceof Error ? err.message : String(err) })
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      scanned: rejected.length,
      candidates: candidates.length,
      activated,
      alreadyActive,
      skipped,
      failed: failures.length,
      failures: failures.slice(0, 20),
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reconcile-payments] Erro:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
