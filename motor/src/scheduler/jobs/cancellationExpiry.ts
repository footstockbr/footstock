// ============================================================================
// Foot Stock Motor — Cron Job: cancellation-expiry
// Migrado de footstock-next/src/app/api/cron/cancellation-expiry/route.ts
// Schedule: 0 5 * * * (diário 05:00 UTC = 02:00 UTC-3)
// ============================================================================

import { logger } from '../../utils/logger'

export async function cancellationExpiryJob(): Promise<void> {
  logger.info('[cron/cancellation-expiry] Iniciando job...')
  // TODO: migrar lógica de processCancellationExpiries
  //       para motor/src/services/cron/cancellation-expiry.ts
  logger.info('[cron/cancellation-expiry] Job concluído (stub).')
}
