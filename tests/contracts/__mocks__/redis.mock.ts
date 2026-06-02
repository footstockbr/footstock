// ============================================================================
// FootStock — Redis Mock para testes de contrato
// Isolamento total: nenhuma conexão Redis real
// Rastreabilidade: module-28/TASK-1/ST001
// ============================================================================

import type { MarketTick, NewsInjectPayload } from '../helpers/contract-test-helpers'

export class RedisMock {
  published: Record<string, string[]> = {}
  subscribers: Record<string, ((channel: string, message: string) => void)[]> = {}
  private store: Record<string, Record<string, string>> = {}

  publish(channel: string, message: string): void {
    if (!this.published[channel]) this.published[channel] = []
    this.published[channel].push(message)
    this.emit(channel, message)
  }

  subscribe(channel: string, callback: (channel: string, message: string) => void): void {
    if (!this.subscribers[channel]) this.subscribers[channel] = []
    this.subscribers[channel].push(callback)
  }

  emit(channel: string, message: string): void {
    ;(this.subscribers[channel] ?? []).forEach((cb) => cb(channel, message))
  }

  get(key: string): string | null {
    return this.store['__kv']?.[key] ?? null
  }

  set(key: string, value: string): void {
    if (!this.store['__kv']) this.store['__kv'] = {}
    this.store['__kv'][key] = value
  }

  hget(key: string, field: string): string | null {
    return this.store[key]?.[field] ?? null
  }

  hset(key: string, field: string, value: string): void {
    if (!this.store[key]) this.store[key] = {}
    this.store[key][field] = value
  }

  reset(): void {
    this.published = {}
    this.subscribers = {}
    this.store = {}
  }
}

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Cria payload válido para o canal market:tick.
 * Baseado em types/market.ts → MarketTickData.
 */
export function createMockTick(
  ticker: string,
  overrides?: Partial<MarketTick>,
): MarketTick {
  const bid = 99.5
  const ask = 100.5
  return {
    ticker,
    price: 100.0,
    change24h: 1.5,
    volume: 50_000,
    bid,
    ask,
    spread: parseFloat((ask - bid).toFixed(10)),
    sentiment: 'POSITIVO',
    timestamp: Date.now(),
    ...overrides,
  }
}

/**
 * Cria payload válido para o canal news:inject.
 * Baseado em motor/src/contracts/news-inject-contract.ts → NewsInjectPayload.
 */
export function createMockNewsInject(
  overrides?: Partial<NewsInjectPayload>,
): NewsInjectPayload {
  return {
    title: 'Galo da Lagoinha FC anuncia dividendos extraordinários',
    ticker: 'GAL3',
    impactCategory: 'FINANCEIRA_CRITICA',
    sentiment: 0.75,
    source: 'Valor Econômico',
    publishedAt: new Date().toISOString(),
    ...overrides,
  }
}
