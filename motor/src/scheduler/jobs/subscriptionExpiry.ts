// ============================================================================
// Foot Stock Motor — Cron Job: subscription-expiry (Wave 1 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/subscription-expiry/route.ts.
// Schedule: 0 2 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function subscriptionExpiryJob(): Promise<void> {
  await cronProxy('subscription-expiry')
}
