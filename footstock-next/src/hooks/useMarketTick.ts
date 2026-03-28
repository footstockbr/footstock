'use client'

// STUB — module-9 irá implementar a versão real com Socket.io/Redis pub-sub
// Este stub garante que module-10 compile enquanto module-9 não está disponível
export interface MarketTick {
  ticker: string
  bid: number
  ask: number
  spread: number
  lastPrice: number
  change24h: number
  isHalted: boolean
  haltReason?: string | null
  estimatedResume?: string | null
  timestamp: number
}

export function useMarketTick(_ticker: string): MarketTick | null {
  // module-9 irá substituir com implementação real de Socket.io/Redis
  return null
}
