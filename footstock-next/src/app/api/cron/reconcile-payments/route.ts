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

// ST004 — Janela de execução do cron. spec no formato "startHour-endHour" (UTC, start
// inclusivo, end exclusivo, 0..24). Ausente/vazio/malformado => sempre permitido (sem
// mudança de comportamento). start==end => janela vazia (nunca permitido). Suporta janela
// que cruza meia-noite (ex.: "22-3" permite 22,23,0,1,2). Pura e testável isoladamente.
export function isWithinReconcileWindow(now: Date, spec?: string | null): boolean {
  if (!spec || !spec.trim()) return true
  const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(spec.trim())
  if (!m) return true // malformado: fail-open (não bloquear o cron por config inválida)
  const start = Number(m[1])
  const end = Number(m[2])
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > 24 || end > 24) return true
  if (start === end) return false // janela vazia => sempre fora
  const hour = now.getUTCHours()
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  // ST004 — fora da janela permitida: early-return SEM efeitos colaterais (nenhuma leitura/
  // escrita no DB nem chamada ao gateway) e com o motivo registrado de forma observável.
  const now = new Date()
  if (!isWithinReconcileWindow(now, env.RECONCILE_WINDOW_UTC)) {
    const reason = `fora da janela permitida (RECONCILE_WINDOW_UTC=${env.RECONCILE_WINDOW_UTC}, hourUtc=${now.getUTCHours()})`
    console.warn('[cron/reconcile-payments] Execução ignorada:', reason)
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'OUTSIDE_WINDOW',
      window: env.RECONCILE_WINDOW_UTC,
      hourUtc: now.getUTCHours(),
      processedAt: now.toISOString(),
    })
  }

  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50
  const rawDays = Number(req.nextUrl.searchParams.get('days') ?? 30)
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(Math.trunc(rawDays), 1), 120) : 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    // ST001 — varrer também PAST_DUE: uma subscription em PAST_DUE com pagamento approved no
    // provedor (recuperação de dunning cujo webhook se perdeu) precisa ser reconciliada. O
    // caminho reconcileApprovedPayment -> upgradeUser já trata PAST_DUE como ativável; o gap
    // era a varredura, que só pegava PENDING e deixava o PAST_DUE preso.
    const pendings = await prisma.subscription.findMany({
      where: {
        status: { in: ['PENDING', 'PAST_DUE'] },
        gateway: 'MERCADO_PAGO',
        createdAt: { gte: since },
      },
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
    // ST005 — NOT_ACTIVATABLE é um SKIP neutro, não uma falha: a assinatura está em estado
    // terminal (não há nada a reconciliar). Contabilizá-lo como falha inflava `failed` e
    // derrubava `success` para false, mascarando o sucesso real do sweep.
    let notActivatable = 0
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
        } else if (result.reason === 'NOT_ACTIVATABLE') {
          // SKIP neutro (ST005): estado terminal — não é falha, não infla a métrica.
          notActivatable++
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
      notActivatable,
      failed: failures.length,
      failures: failures.slice(0, 20),
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reconcile-payments] Erro:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
