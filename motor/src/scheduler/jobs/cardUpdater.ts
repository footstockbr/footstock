// ============================================================================
// Foot Stock Motor — Cron Job: card-updater
// Migrado de footstock-next/src/app/api/cron/card-updater/route.ts
// Schedule: 0 8 * * * (diário 08:00 UTC)
// ============================================================================

import { logger } from '../../utils/logger'

export async function cardUpdaterJob(): Promise<void> {
  logger.info('[cron/card-updater] Iniciando job...')
  // TODO: migrar lógica de detecção de cartões expirando (CardUpdaterService)
  //       para motor/src/services/cron/card-updater.ts
  logger.info('[cron/card-updater] Job concluído (stub).')
}
