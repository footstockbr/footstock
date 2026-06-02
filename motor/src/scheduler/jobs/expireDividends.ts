// ============================================================================
// FootStock Motor — Cron Job: expire-dividends (Wave 1 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/expire-dividends/route.ts.
// Schedule: 0 8 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function expireDividendsJob(): Promise<void> {
  await cronProxy('expire-dividends')
}
