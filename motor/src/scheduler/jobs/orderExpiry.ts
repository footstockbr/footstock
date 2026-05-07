// ============================================================================
// Foot Stock Motor — Cron Job: order-expiry
// Migrado de footstock-next/src/app/api/cron/order-expiry/route.ts
// Schedule: 0 6 * * *
// ============================================================================

import { logger } from '../../utils/logger'

export async function orderExpiryJob(): Promise<void> {
  logger.info('[cron/order-expiry] Iniciando job...')
  // TODO: migrar lógica para motor/src/services/cron/order-expiry.ts
  logger.info('[cron/order-expiry] Job concluído (stub).')
}
