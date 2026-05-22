// ============================================================================
// FootStock — TICKERS_40
// Lista canônica dos 40 tickers disponíveis na plataforma
// Fonte: module-18/TASK-7/ST005
// ============================================================================

import { CLUBS_PUBLIC } from '@/lib/constants/clubs-public'

export const TICKERS_40 = CLUBS_PUBLIC.map((club) => club.ticker) as readonly string[]

export type Ticker = (typeof TICKERS_40)[number]
