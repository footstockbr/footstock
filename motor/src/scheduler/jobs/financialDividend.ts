// ============================================================================
// FootStock Motor — Cron Job: financial-dividend
// Migrado de footstock-next/src/app/api/cron/financial-dividend/route.ts
// Schedule: 0 5 1-7 * * (05:00 UTC = 02:00 BRT, dias 1-7 do mês — 1º dia útil)
// ============================================================================

import { logger } from '../../utils/logger'

export async function financialDividendJob(): Promise<void> {
  logger.info('[cron/financial-dividend] Iniciando job...')
  // TODO: migrar lógica de runFinancialDividendCron
  //       para motor/src/services/cron/financial-dividend.ts
  logger.info('[cron/financial-dividend] Job concluído (stub).')
}
