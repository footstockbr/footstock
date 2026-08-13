/**
 * Task 01 / Task 06 — Testes de caracterização: DelayService não deve vazar preço atual.
 *
 * Estes testes afirmam que:
 * 1. applyPriceDelay retorna BUFFERING quando não há histórico elegível no cutoff.
 * 2. applyPriceDelay retorna AVAILABLE com preço, variação e timestamp do mesmo
 *    snapshot quando há histórico.
 * 3. applyDelayBatch NÃO mantém currentPrice real para ativos sem histórico.
 *
 * Eles DEVEM FALHAR contra o código anterior, que retornava `asset` (com preço
 * real) quando não encontrava histórico.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockFindFirst = jest.fn()
const mockFindMany = jest.fn()
const mockQueryRaw = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    priceHistory: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}))

import { applyPriceDelay, applyDelayBatch } from '@/lib/services/DelayService'
import type { AssetListItem } from '@/types/market'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-08-13T18:00:00.000Z')

function makeAsset(overrides?: Partial<AssetListItem>): AssetListItem {
  return {
    id: 'asset-1',
    ticker: 'FLA1',
    displayName: 'Flamengo',
    currentPrice: 55.0,
    change: 2.5,
    ...overrides,
  }
}

beforeAll(() => {
  jest.useFakeTimers({ now: FIXED_NOW.getTime() })
})

afterAll(() => {
  jest.useRealTimers()
})

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Gate P0: applyPriceDelay fail-closed ────────────────────────────────────

describe('Gate P0: applyPriceDelay fail-closed', () => {
  test('sem histórico no cutoff: retorna BUFFERING sem preço real', async () => {
    mockFindMany.mockResolvedValue([])

    const asset = makeAsset({ currentPrice: 55.0 })
    const result = await applyPriceDelay(asset, 'JOGADOR')

    expect(result.status).toBe('BUFFERING')
    if (result.status === 'BUFFERING') {
      expect(result.isDelayed).toBe(true)
      expect(result.delayMinutes).toBe(60)
    }
  })

  test('com histórico no cutoff: retorna AVAILABLE com preço histórico e variação', async () => {
    const historicalPrice = 48.50
    const previousPrice = 47.00
    mockFindMany.mockResolvedValue([
      { close: historicalPrice, timestamp: new Date('2026-08-13T17:00:00.000Z') },
      { close: previousPrice, timestamp: new Date('2026-08-13T16:55:00.000Z') },
    ])

    const asset = makeAsset({ currentPrice: 55.0 })
    const result = await applyPriceDelay(asset, 'JOGADOR')

    expect(result.status).toBe('AVAILABLE')
    if (result.status === 'AVAILABLE') {
      expect(result.currentPrice).toBe(historicalPrice)
      expect(result.currentPrice).not.toBe(55.0)
      // (48.50 - 47.00) / 47.00 * 100 = 3.19%
      expect(result.changePercent).toBe(3.19)
      expect(result.timestamp).toBe('2026-08-13T17:00:00.000Z')
      expect(result.isDelayed).toBe(true)
      expect(result.delayMinutes).toBe(60)
    }
  })

  test('LENDA (delay=0): retorna AVAILABLE com preço real', async () => {
    const asset = makeAsset({ currentPrice: 55.0 })
    const result = await applyPriceDelay(asset, 'LENDA')

    expect(result.status).toBe('AVAILABLE')
    if (result.status === 'AVAILABLE') {
      expect(result.currentPrice).toBe(55.0)
      expect(result.isDelayed).toBe(false)
    }
  })
})

// ─── Gate P0: applyDelayBatch fail-closed ────────────────────────────────────

describe('Gate P0: applyDelayBatch fail-closed', () => {
  test('ativo sem histórico no cutoff: currentPrice é 0 e delayStatus BUFFERING', async () => {
    mockQueryRaw.mockResolvedValue([])

    const assets = [makeAsset({ id: 'asset-1', currentPrice: 55.0 })]
    const result = await applyDelayBatch(assets, 'JOGADOR')

    expect(result[0].currentPrice).toBe(0)
    expect(result[0].delayStatus).toBe('BUFFERING')
    expect(result[0].delayedTimestamp).toBeNull()
  })

  test('ativo com histórico: currentPrice é histórico e variação usa snapshot anterior', async () => {
    mockQueryRaw.mockResolvedValue([
      { asset_id: 'asset-1', close: '48.50', timestamp: new Date('2026-08-13T17:00:00.000Z'), rn: 1 },
      { asset_id: 'asset-1', close: '47.00', timestamp: new Date('2026-08-13T16:55:00.000Z'), rn: 2 },
    ])

    const assets = [makeAsset({ id: 'asset-1', currentPrice: 55.0 })]
    const result = await applyDelayBatch(assets, 'JOGADOR')

    expect(result[0].currentPrice).toBe(48.50)
    expect(result[0].changePercent).toBe(3.19)
    expect(result[0].delayStatus).toBe('AVAILABLE')
  })

  test('LENDA (delay=0): retorna sem modificação', async () => {
    const assets = [makeAsset({ currentPrice: 55.0 })]
    const result = await applyDelayBatch(assets, 'LENDA')

    expect(result[0].currentPrice).toBe(55.0)
    expect(result[0].delayStatus).toBe('AVAILABLE')
  })

  test('batch vazio: retorna array vazio sem query', async () => {
    const result = await applyDelayBatch([], 'JOGADOR')

    expect(result).toEqual([])
    expect(mockQueryRaw).not.toHaveBeenCalled()
  })
})
