// ============================================================================
// FootStock Motor — Cron Job: interest-accrual (Wave 1 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/interest-accrual/route.ts.
// Schedule: 0 7 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function interestAccrualJob(): Promise<void> {
  await cronProxy('interest-accrual')
}
