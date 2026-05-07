// ============================================================================
// Foot Stock Motor — Cron Job: notification-digest
// Migrado de footstock-next/src/app/api/cron/notification-digest/route.ts
// Schedule: 0 10 * * *
// ============================================================================

import { logger } from '../../utils/logger'

export async function notificationDigestJob(): Promise<void> {
  logger.info('[cron/notification-digest] Iniciando job...')
  // TODO: migrar lógica para motor/src/services/cron/notification-digest.ts
  logger.info('[cron/notification-digest] Job concluído (stub).')
}
