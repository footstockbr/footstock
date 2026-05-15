// ============================================================================
// Foot Stock Motor — Cron Job: cancellation-lock (Wave 2 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/cancellation-lock/route.ts.
// Schedule: 0 1 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function cancellationLockJob(): Promise<void> {
  await cronProxy('cancellation-lock')
}
