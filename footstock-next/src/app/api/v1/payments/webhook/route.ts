import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// POST /api/v1/payments/webhook
// Público — validado por HMAC-SHA256 (sem Bearer token)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // TODO: Implementar via /auto-flow execute
    // 1. Detectar gateway pelo header X-Gateway ou pelo payload
    // 2. Validar HMAC-SHA256 com o secret do gateway correspondente
    // 3. Se inválido: retornar 400 silencioso (sem revelar detalhes)
    // 4. Extrair gatewayTransactionId para idempotência
    // 5. Atualizar Subscription.status + User.planType
    // 6. Creditar bônus FS$ após 7 dias do período de arrependimento

    const gatewaySignature = request.headers.get('x-gateway-signature') ??
                             request.headers.get('x-mp-signature') ??
                             request.headers.get('x-pagseguro-signature')

    if (!gatewaySignature) {
      // Rejeição silenciosa — não revelar detalhes de segurança
      return errors.validation('Assinatura inválida.')
    }

    // Verificar idempotência
    const gatewayTransactionId = body?.data?.id ?? body?.transaction_id ?? body?.id
    if (gatewayTransactionId) {
      const existing = await prisma.payment.findUnique({
        where: { gatewayTransactionId: String(gatewayTransactionId) },
      })
      if (existing) {
        return errors.conflict('PAYMENT_005', 'Pagamento já processado.')
      }
    }

    return ok({ received: true })
  } catch {
    return errors.server()
  }
}
