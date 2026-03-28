// ============================================================================
// Foot Stock — SessionService (client-side)
// Helper para consumo do endpoint /api/v1/market/session.
// Service puro sem estado — sem React.
// ============================================================================

import { MarketSession } from '@/lib/constants/market'
import { formatCountdown, getSessionLabel } from '@/lib/services/session-manager'

export interface MarketSessionData {
  session: MarketSession
  volatilityMultiplier: number
  nextSession: MarketSession
  transitionAt: string   // ISO datetime
  countdownSeconds: number
  isMarketOpen: boolean
  timestamp: string      // ISO datetime
}

export async function getMarketSession(): Promise<MarketSessionData> {
  const res = await fetch('/api/v1/market/session', {
    cache: 'no-store',
    headers: { 'Accept': 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`Falha ao buscar sessão de mercado: ${res.status}`)
  }

  return res.json() as Promise<MarketSessionData>
}

export { formatCountdown, getSessionLabel }
