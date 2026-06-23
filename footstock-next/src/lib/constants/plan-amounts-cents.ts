// ============================================================================
// FootStock — SSoT de pricing (FIX-12)
// Valores em CENTAVOS BRL (Int — PCI-DSS, NUNCA Float).
//
// Fonte autoritativa: valor efetivamente enviado a cobranca no checkout Pix
// (preco temporario de teste, mantido por decisao de 2026-06-22 — alinhar a UI
// ao valor cobrado em vez de inflar o display). Qualquer preco exibido no client
// e qualquer cobranca no backend devem DERIVAR deste modulo. Sem este alinhamento,
// "preco exibido != amountCents/100 cobrado" e o usuario seria enganado.
//
// Invariante: preco exibido == amountCents/100 cobrado.
// ============================================================================

import type { PlanType } from '@/lib/enums'

export type BillingPeriod = 'monthly' | 'yearly'

/**
 * SSoT: mapa imutavel plano -> periodo -> centavos.
 * `as const satisfies` garante imutabilidade em tipo E cobertura exaustiva de PlanType.
 */
export const PLAN_AMOUNTS_CENTS = {
  JOGADOR: { monthly: 0, yearly: 0 },
  CRAQUE: { monthly: 100, yearly: 100 }, // R$1,00 — preco temporario de teste
  LENDA: { monthly: 120, yearly: 120 }, // R$1,20 — preco de teste (difere de CRAQUE p/ evitar recusa por compra duplicada)
} as const satisfies Record<PlanType, Record<BillingPeriod, number>>

/** Planos pagos (excluem o gratuito JOGADOR). */
export type PaidPlanType = Exclude<PlanType, 'JOGADOR'>

/**
 * Acesso type-safe ao valor em centavos. Falha EXPLICITA em plano/periodo
 * inexistente — sem plano default invisivel, sem retorno silencioso.
 */
export function getPlanAmountCents(plan: PlanType, period: BillingPeriod): number {
  const byPeriod = PLAN_AMOUNTS_CENTS[plan]
  if (!byPeriod) {
    throw new Error(`PLAN_AMOUNTS_CENTS: plano desconhecido "${plan}"`)
  }
  const cents = byPeriod[period]
  if (typeof cents !== 'number') {
    throw new Error(`PLAN_AMOUNTS_CENTS: periodo desconhecido "${period}" para plano "${plan}"`)
  }
  return cents
}

/**
 * Formata centavos como moeda BRL (pt-BR). Falha para valores nao-finitos
 * para nunca renderizar `NaN`. O caller decide o fallback de UI quando o valor
 * for nulo/ausente — este helper jamais mascara erro exibindo "R$ 0,00".
 */
export function formatBRLFromCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new Error(`formatBRLFromCents: valor invalido "${cents}"`)
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}
