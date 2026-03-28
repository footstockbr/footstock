// GET /api/v1/market/session — PUBLIC
// Retorna sessão de mercado atual, multiplicador de volatilidade e próxima transição.

import { NextResponse } from 'next/server'
import {
  getCurrentSession,
  getVolatilityMultiplier,
  getNextTransition,
  isMarketOpen,
} from '@/lib/services/session-manager'

export async function GET() {
  try {
    const now = new Date()
    const session = getCurrentSession(now)
    const volatilityMultiplier = getVolatilityMultiplier(session, now)
    const { session: nextSession, transitionAt, countdownSeconds } = getNextTransition(now)
    const marketOpen = isMarketOpen(now)

    return NextResponse.json(
      {
        session,
        volatilityMultiplier,
        nextSession,
        transitionAt,
        countdownSeconds,
        isMarketOpen: marketOpen,
        timestamp: now.toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch {
    return NextResponse.json(
      { error: 'SYS_001', message: 'Erro interno ao calcular sessão' },
      { status: 500 }
    )
  }
}
