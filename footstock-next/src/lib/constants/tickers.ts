// ============================================================================
// FootStock — TICKERS_40
// Lista canônica dos 40 tickers disponíveis na plataforma
// Fonte: module-18/TASK-7/ST005
// ============================================================================

import { CLUBS } from '@/lib/constants/clubs'

export const TICKERS_40 = CLUBS.map((club) => club.ticker) as readonly string[]

export type Ticker = (typeof TICKERS_40)[number]
