// ============================================================================
// FootStock Motor — Cron Job: reconcile-payments (item 12, defesa de profundidade)
// Proxy HTTP para footstock-next/src/app/api/cron/reconcile-payments/route.ts.
// Varre subscriptions PENDING (Mercado Pago) e recupera pagamentos APROVADOS cujo webhook
// se perdeu (ex.: janela do bug do manifesto HMAC), buscando no MP por external_reference.
// Idempotente (upgradeUser -> ALREADY_ACTIVE, payment.upsert por gatewayTransactionId).
// Schedule: 0 */6 * * * (a cada 6h).
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function reconcilePaymentsJob(): Promise<void> {
  await cronProxy('reconcile-payments')
}
