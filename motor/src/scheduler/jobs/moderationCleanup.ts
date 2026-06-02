// ============================================================================
// FootStock Motor — Cron Job: moderation-cleanup
// Migrado de footstock-next/src/app/api/cron/moderation-cleanup/route.ts
// Schedule: 0 3 * * *
// ============================================================================

import { logger } from '../../utils/logger'

export async function moderationCleanupJob(): Promise<void> {
  logger.info('[cron/moderation-cleanup] Iniciando job...')
  // TODO: migrar lógica para motor/src/services/cron/moderation-cleanup.ts
  logger.info('[cron/moderation-cleanup] Job concluído (stub).')
}
