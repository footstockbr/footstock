// ============================================================================
// FootStock Motor — Cron Job: bonus-credit (Wave 1 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/bonus-credit/route.ts.
// Schedule: 0 3 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function bonusCreditJob(): Promise<void> {
  await cronProxy('bonus-credit')
}
