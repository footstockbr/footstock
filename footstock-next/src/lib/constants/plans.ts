import {
  PLAN_AMOUNTS_CENTS,
  formatBRLFromCents,
} from "@/lib/constants/plan-amounts-cents";

export enum PlanType {
  JOGADOR = "JOGADOR",
  CRAQUE = "CRAQUE",
  LENDA = "LENDA",
}

export const PLAN_LABELS: Record<PlanType, string> = {
  [PlanType.JOGADOR]: "Jogador",
  [PlanType.CRAQUE]: "Craque",
  [PlanType.LENDA]: "Lenda",
};

export const PLAN_COLORS: Record<PlanType, string> = {
  [PlanType.JOGADOR]: "var(--plan-jogador)",
  [PlanType.CRAQUE]: "var(--plan-craque)",
  [PlanType.LENDA]: "var(--plan-lenda)",
};

// FIX-12: strings de preço DERIVADAS da SSoT `PLAN_AMOUNTS_CENTS` — nunca
// hardcodar. Alinha display ao valor cobrado (corrige LENDA, que era exibido
// como "R$ 1,00" mas é cobrado R$ 1,20).
export const PLAN_PRICES: Record<PlanType, string> = {
  [PlanType.JOGADOR]: "Grátis",
  [PlanType.CRAQUE]: `${formatBRLFromCents(PLAN_AMOUNTS_CENTS.CRAQUE.monthly)}/mês`,
  [PlanType.LENDA]: `${formatBRLFromCents(PLAN_AMOUNTS_CENTS.LENDA.monthly)}/mês`,
};
