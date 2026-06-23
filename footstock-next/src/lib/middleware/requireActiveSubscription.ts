// ============================================================================
// FootStock — requireActiveSubscription middleware
// FIX-10 (2026-06-22): o bloqueio compulsorio em CANCELLATION_LOCK era codigo
// morto. Dependia de `forcedLiquidationAt`, que nunca e setado non-null (todas
// as escritas da coluna sao `: null`), logo o branch de 403 (PAYMENT_054) e o
// lookup que o alimentava eram inalcancaveis. Ambos foram removidos.
// FIX-20 (2026-06-22) confirmou o no-op como decisao canonica: a funcao e mantida
// preservando a assinatura usada pelos callers (orders, positions/short,
// ai/analyze, leagues). A reativacao do bloqueio exige uma feature nova com spec
// propria (liquidacao forcada T+48h descontinuada).
// ============================================================================

import type { NextResponse } from 'next/server'

/**
 * Guard de CANCELLATION_LOCK. Atualmente no-op: retorna sempre `null` (sem
 * bloqueio). O fluxo de liquidacao forcada T+48h foi descontinuado (ver FIX-10);
 * a reativacao do bloqueio depende de uma feature nova com spec propria.
 */
export function requireActiveSubscription(
  _userId: string,
  _capability: 'NEW_ORDER' | 'NEW_SHORT' | 'LEVERAGE' | 'JOIN_LEAGUE' | 'CREATE_LEAGUE' | 'AI_ADVISOR'
): Promise<NextResponse | null> {
  return Promise.resolve(null)
}
