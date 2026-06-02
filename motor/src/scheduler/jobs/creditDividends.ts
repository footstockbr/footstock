// ============================================================================
// FootStock Motor — Cron Job: credit-dividends (Wave 1 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/credit-dividends/route.ts.
// Schedule: 0 9 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function creditDividendsJob(): Promise<void> {
  await cronProxy('credit-dividends')
}
