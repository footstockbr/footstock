// ============================================================================
// Foot Stock — Limites, taxas e valores por plano
// ============================================================================

import type { PlanType } from '../enums';

/** Itens por página na paginação padrão */
export const PAGE_SIZE = 20;

/** Limite de ordens simultâneas ativas por plano */
export const ORDER_LIMITS_BY_PLAN: Record<PlanType, number> = {
  JOGADOR: 5,
  CRAQUE: 20,
  LENDA: 50,
};

/** Limite de ordens ativas por plano */
export const MAX_ACTIVE_ORDERS_BY_PLAN: Record<PlanType, number> = {
  JOGADOR: 10,
  CRAQUE: 50,
  LENDA: 200,
};

/** Taxa de corretagem por operação (percentual decimal) */
export const FEE_BY_PLAN: Record<PlanType, number> = {
  JOGADOR: 0.005,
  CRAQUE: 0.0035,
  LENDA: 0.0025,
};

/** Delay de cotação em milissegundos por plano */
export const DELAY_BY_PLAN: Record<PlanType, number> = {
  JOGADOR: 15000,
  CRAQUE: 5000,
  LENDA: 0,
};

/** Preço mensal em BRL por plano */
export const PLAN_PRICES: Record<PlanType, number> = {
  JOGADOR: 0,
  CRAQUE: 29.9,
  LENDA: 59.9,
};

/** Desconto para pagamento anual (percentual decimal) */
export const ANNUAL_DISCOUNT = 0.2;

/** Saldo inicial em FS$ ao criar conta */
export const INITIAL_FS_BALANCE = 100_000;

/** Percentual máximo do portfólio em um único ativo (decimal) */
export const MAX_POSITION_PERCENT = 0.25;

/** Variação percentual que ativa o circuit breaker (decimal) */
export const CIRCUIT_BREAKER_THRESHOLD = 0.15;

/** Duração do halt do circuit breaker em milissegundos (5 minutos) */
export const CIRCUIT_BREAKER_HALT_DURATION = 300_000;
