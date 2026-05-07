// ============================================================================
// Foot Stock Motor — Cron Job: data-retention
// Migrado de footstock-next/src/app/api/cron/data-retention/route.ts
// Schedule: 0 5 * * *
// ============================================================================

import { logger } from '../../utils/logger'

export async function dataRetentionJob(): Promise<void> {
  logger.info('[cron/data-retention] Iniciando job...')
  // TODO: migrar lógica para motor/src/services/cron/data-retention.ts
  logger.info('[cron/data-retention] Job concluído (stub).')
}
