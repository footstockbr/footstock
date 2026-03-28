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

export const PLAN_PRICES: Record<PlanType, string> = {
  [PlanType.JOGADOR]: "Grátis",
  [PlanType.CRAQUE]: "R$ 19,90/mês",
  [PlanType.LENDA]: "R$ 39,90/mês",
};
