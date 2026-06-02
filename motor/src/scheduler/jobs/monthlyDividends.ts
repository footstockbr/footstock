// ============================================================================
// FootStock Motor — Cron Job: monthly-dividends (Wave 1 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/monthly-dividends/route.ts.
// Schedule: 0 9 1 * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function monthlyDividendsJob(): Promise<void> {
  await cronProxy('monthly-dividends')
}
