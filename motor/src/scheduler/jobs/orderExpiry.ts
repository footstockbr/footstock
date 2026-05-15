// ============================================================================
// Foot Stock Motor — Cron Job: order-expiry (Wave 2 / Option C)
// Proxy HTTP para footstock-next/src/app/api/cron/order-expiry/route.ts.
// Schedule: 0 6 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function orderExpiryJob(): Promise<void> {
  await cronProxy('order-expiry')
}
