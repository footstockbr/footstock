// ============================================================================
// Foot Stock Motor — Cron Job: cancellation-expiry (Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/cancellation-expiry/route.ts.
// Regra de negocio (downgrade T+7, fechar posicoes) vive na rota Next (fonte unica).
// Schedule: 0 5 * * * (diario 05:00 UTC).
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function cancellationExpiryJob(): Promise<void> {
  await cronProxy('cancellation-expiry')
}
