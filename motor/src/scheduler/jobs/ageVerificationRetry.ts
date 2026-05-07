// ============================================================================
// Foot Stock Motor — Cron Job: age-verification-retry
// Migrado de footstock-next/src/app/api/cron/age-verification-retry/route.ts
// Schedule: 0 6 * * *
// ============================================================================

import { logger } from '../../utils/logger'

export async function ageVerificationRetryJob(): Promise<void> {
  logger.info('[cron/age-verification-retry] Iniciando job...')
  // TODO: migrar lógica para motor/src/services/cron/age-verification-retry.ts
  logger.info('[cron/age-verification-retry] Job concluído (stub).')
}
