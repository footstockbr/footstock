// ============================================================================
// FootStock Motor — Cron Job: dunning (Wave 1 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/dunning/route.ts.
// Schedule: 0 4 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function dunningJob(): Promise<void> {
  await cronProxy('dunning')
}
