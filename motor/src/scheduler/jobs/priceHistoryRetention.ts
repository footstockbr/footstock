// ============================================================================
// FootStock Motor — Cron Job: price-history-retention
// Schedule: 40 3 * * * (diario, 03:40 UTC = 00:40 BRT, fora do pregao)
//
// Compacta `price_history` para 1 snapshot por ativo por hora depois de
// PRICE_HISTORY_RAW_RETENTION_DAYS (default 31) e anula `attribution`. Sem isso
// a tabela encheu o volume de 50 GB do Postgres em 2026-10-29.
// Logica e politica em services/cron/price-history-retention.ts.
// Kill switch: PRICE_HISTORY_RETENTION_ENABLED=false (sem redeploy de codigo).
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { runPriceHistoryRetention } from '../../services/cron/price-history-retention'
import { logger } from '../../utils/logger'

let _prisma: PrismaClient | null = null

export async function priceHistoryRetentionJob(): Promise<void> {
  try {
    if (!_prisma) _prisma = new PrismaClient()
    await runPriceHistoryRetention({ prisma: _prisma })
  } catch (err) {
    // Retencao e manutencao: nunca derruba o motor.
    logger.error(`[cron/price-history-retention] Erro fatal no job: ${(err as Error).message}`)
  }
}
