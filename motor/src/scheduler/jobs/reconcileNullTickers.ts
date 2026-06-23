// ============================================================================
// FootStock Motor — Cron Job: reconcile-null-tickers
// Proxy HTTP para footstock-next/src/app/api/cron/reconcile-null-tickers/route.ts.
// Safety-net: re-resolve o ticker de notícias publicadas ainda "sem time" (cura
// linhas legadas e as que se tornaram resolvíveis depois). Precision-first, pelo
// título. Idempotente. Schedule: diário (0 2 * * *).
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function reconcileNullTickersJob(): Promise<void> {
  // failOnBodyErrors:false — falhas transitórias (DB/resolver) são toleradas e
  // re-tentadas no próximo ciclo; não devem marcar o scheduler como vermelho.
  await cronProxy('reconcile-null-tickers', { failOnBodyErrors: false })
}
