// ============================================================================
// Foot Stock Motor — Cron Job: nsm
// Migrado de footstock-next/src/app/api/v1/cron/nsm/route.ts
// Schedule: 0 23 * * *
// ============================================================================

import { logger } from '../../utils/logger'

export async function nsmJob(): Promise<void> {
  logger.info('[cron/nsm] Iniciando job...')
  // TODO: migrar lógica de runNSMReport() para motor/src/services/cron/nsm.ts
  logger.info('[cron/nsm] Job concluído (stub).')
}
