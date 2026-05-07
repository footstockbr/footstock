export const DELAY_BY_PLAN = {
  JOGADOR: 3_600_000, // 1h
  CRAQUE: 1_800_000, // 30min
  LENDA: 0, // realtime
} as const

export type PlanType = keyof typeof DELAY_BY_PLAN
