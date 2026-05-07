// ============================================================================
// Foot Stock Motor — Cron Job: scoring
// Migrado de footstock-next/src/app/api/cron/scoring/route.ts
// Schedule: 0 5 * * *
// ============================================================================

import { logger } from '../../utils/logger'

export async function scoringJob(): Promise<void> {
  logger.info('[cron/scoring] Iniciando job...')
  // TODO: migrar lógica de scoringJobService.recalcularTodasLigas()
  //       para motor/src/services/cron/scoring.ts
  logger.info('[cron/scoring] Job concluído (stub).')
}
