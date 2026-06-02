// ============================================================================
// FootStock Motor — Cron Job: scoring (Wave 3 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/scoring/route.ts.
// Schedule: 0 5 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function scoringJob(): Promise<void> {
  await cronProxy('scoring')
}
