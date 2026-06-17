// ============================================================================
// FootStock — POST /api/v1/admin/payments/replay
// Reprocessa, sob demanda, um pagamento aprovado que nao ativou o plano (ex.: webhook
// perdido/rejeitado na janela do bug do HMAC, item 12). Reusa o caminho idempotente do
// webhook via planService.reconcileApprovedPayment. So Mercado Pago por ora.
// Protegido por withAdmin (mesmo dominio de auditoria de webhooks).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { planService } from '@/lib/services/PlanService'
import { GatewayType } from '@/lib/gateways/IGateway'
import { webhookAuditService } from '@/lib/services/WebhookAuditService'
import type { SubscriptionGateway } from '@prisma/client'

const BodySchema = z.object({
  gateway: z.enum(['MERCADO_PAGO']).default('MERCADO_PAGO'),
  paymentId: z.string().trim().min(1),
})

export const POST = withAdmin('admin:audit')(async (req: NextRequest) => {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Corpo invalido.' } },
      { status: 400 }
    )
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'paymentId obrigatorio (id do pagamento no gateway).' } },
      { status: 400 }
    )
  }

  const { paymentId } = parsed.data
  const result = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, paymentId)

  // Trilha de auditoria: replay bem-sucedido conta como ACEITO; falha como REJEITADO,
  // visivel no mesmo painel de logs de webhook (WebhookAuditService.listLogs).
  await webhookAuditService
    .logWebhook({
      gateway: 'MERCADO_PAGO' as SubscriptionGateway,
      eventType: 'PAYMENT_CONFIRMED',
      transactionId: paymentId,
      subscriptionId: result.ok ? result.subscriptionId : undefined,
      status: result.ok ? 'ACCEPTED' : 'REJECTED',
      hmacValid: true,
      errorMessage: result.ok
        ? `Replay admin: ${result.action}`
        : `Replay admin falhou: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`,
    })
    .catch(() => {})

  return NextResponse.json({ data: result }, { status: result.ok ? 200 : 422 })
})
