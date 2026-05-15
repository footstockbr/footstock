// ============================================================================
// Foot Stock Motor — Cron Job: nsm (Wave 3 / Option C)
// Proxy HTTP para footstock-next/src/app/api/v1/cron/nsm/route.ts
// (rota canonica: chama runNSMReport(); rastreabilidade INT-115/module-27/TASK-3).
// Coexiste com legacy footstock-next/src/app/api/cron/nsm/route.ts (a desativar
// em cleanup separado conforme FS-SCHED-W3-2026-05-15).
// Schedule: 0 23 * * *
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function nsmJob(): Promise<void> {
  await cronProxy('nsm', { apiVersion: 'v1' })
}
