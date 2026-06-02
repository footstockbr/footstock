// ============================================================================
// FootStock Motor — Cron Job: data-retention (Wave 2 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/data-retention/route.ts.
// Schedule: 0 5 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function dataRetentionJob(): Promise<void> {
  await cronProxy('data-retention')
}
