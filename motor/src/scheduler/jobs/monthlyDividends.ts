// ============================================================================
// Foot Stock Motor — Cron Job: monthly-dividends
// Migrado de footstock-next/src/app/api/cron/monthly-dividends/route.ts
// Schedule: 0 9 1 * *
// ============================================================================

import { logger } from '../../utils/logger'

export async function monthlyDividendsJob(): Promise<void> {
  logger.info('[cron/monthly-dividends] Iniciando job...')
  // TODO: migrar lógica para motor/src/services/cron/monthly-dividends.ts
  logger.info('[cron/monthly-dividends] Job concluído (stub).')
}
