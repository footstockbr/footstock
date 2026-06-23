/**
 * Limites e valores padrão da plataforma.
 */

import type { PlanType } from '../enums'
import { PLAN_AMOUNTS_CENTS } from '@/lib/constants/plan-amounts-cents'

/** Itens por página na paginação padrão */
export const PAGE_SIZE = 20

/** Saldo inicial em FS$ ao criar conta */
export const INITIAL_FS_BALANCE = 2_000

/** Taxa operacional por plano (percentual sobre o valor da operação). */
export const FEE_RATES = {
  JOGADOR: 0.002,  // 0.2%
  CRAQUE: 0.0015,  // 0.15%
  LENDA: 0.001,    // 0.1%
} as const

/** Limite de ordens simultâneas ativas por plano */
export const ORDER_LIMITS_BY_PLAN: Record<PlanType, number> = {
  JOGADOR: 5,
  CRAQUE: 20,
  LENDA: 50,
}

/** Limite de ordens ativas por plano */
export const MAX_ACTIVE_ORDERS_BY_PLAN: Record<PlanType, number> = {
  JOGADOR: 10,
  CRAQUE: 50,
  LENDA: 200,
}

/**
 * Taxas operacionais FIXAS por faixa de valor da operação (INTAKE canônico).
 * Valor da operação = quantidade x preço.
 * Faixas ordenadas por threshold crescente.
 */
export const OPERATIONAL_FEES = [
  { threshold: 500, fee: 0.25 },    // operações até FS$ 500
  { threshold: 1000, fee: 0.35 },   // operações de FS$ 500 a FS$ 1.000
  { threshold: Infinity, fee: 0.45 }, // operações acima de FS$ 1.000
] as const

/**
 * Calcula a taxa operacional fixa com base no valor da operação.
 * @param operationValue - quantidade x preço da operação
 * @returns taxa fixa em FS$ (0.25, 0.35 ou 0.45)
 */
export function calculateFee(operationValue: number): number {
  for (const tier of OPERATIONAL_FEES) {
    if (operationValue <= tier.threshold) return tier.fee
  }
  return OPERATIONAL_FEES[OPERATIONAL_FEES.length - 1]?.fee ?? 0.45
}

/** Delay de cotação em milissegundos por plano */
export const DELAY_BY_PLAN: Record<PlanType, number> = {
  JOGADOR: 3_600_000, // 1h
  CRAQUE: 1_800_000, // 30min
  LENDA: 0,
}

/**
 * Preço mensal em BRL por plano, DERIVADO da SSoT `PLAN_AMOUNTS_CENTS`
 * (centavos / 100). FIX-12: nunca hardcodar — alinha display ao valor cobrado.
 */
export const PLAN_PRICES: Record<PlanType, number> = {
  JOGADOR: PLAN_AMOUNTS_CENTS.JOGADOR.monthly / 100,
  CRAQUE: PLAN_AMOUNTS_CENTS.CRAQUE.monthly / 100,
  LENDA: PLAN_AMOUNTS_CENTS.LENDA.monthly / 100,
}

/** Desconto para pagamento anual (percentual decimal) */
export const ANNUAL_DISCOUNT = 0.25

/** Percentual máximo do portfólio em um único ativo (decimal) */
export const MAX_POSITION_PERCENT = 0.25

/** Variação percentual que ativa o circuit breaker (decimal) — INTAKE: 8% */
export const CIRCUIT_BREAKER_THRESHOLD = 0.08

/** Duração do halt do circuit breaker em milissegundos (5 minutos) */
export const CIRCUIT_BREAKER_HALT_DURATION = 300_000
