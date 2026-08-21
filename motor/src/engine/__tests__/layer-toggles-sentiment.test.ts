import {
  CANONICAL_LAYER_TOGGLE_KEYS,
  normalizeLayerToggles,
} from '../MotorLayerRuntimeConfig'
import { SentimentWriter, SENTIMENT_WRITE_CADENCE } from '../SentimentWriter'
import type { AssetState } from '../../types/motor.types'

// ─── ST001: sentimentCalc em CANONICAL_LAYER_TOGGLE_KEYS ────────────────

describe('CANONICAL_LAYER_TOGGLE_KEYS inclui sentimentCalc', () => {
  it('contem sentimentCalc na lista canonica', () => {
    expect(CANONICAL_LAYER_TOGGLE_KEYS).toContain('sentimentCalc')
  })
})

// ─── ST006: normalizeLayerToggles com sentimentCalc ─────────────────────

describe('normalizeLayerToggles — sentimentCalc', () => {
  it('sentimentCalc: false retorna values.sentimentCalc === false sem diagnostico unknown', () => {
    const result = normalizeLayerToggles({ sentimentCalc: false })
    expect(result.values.sentimentCalc).toBe(false)
    expect(result.diagnostics).not.toContain('layer_toggle_unknown:sentimentCalc')
  })

  it('input vazio retorna sentimentCalc: true (default)', () => {
    const result = normalizeLayerToggles({})
    expect(result.values.sentimentCalc).toBe(true)
  })

  it('undefined retorna sentimentCalc: true (default)', () => {
    const result = normalizeLayerToggles(undefined)
    expect(result.values.sentimentCalc).toBe(true)
  })
})

// ─── ST006: SentimentWriter toggle gate ─────────────────────────────────

function makeAssetState(id: string): AssetState {
  return {
    id,
    ticker: `TEST${id}`,
    currentPrice: 10.0,
    fairValue: 10.0,
    volume: 0,
    isPaused: false,
    sentimentScore: 0.5,
    sentimentLabel: 'BULLISH',
    sentimentReason: 'test',
    sentimentComponents: { ofi: 0.1, supply: 0.2, pressure: 0.2 },
    sentimentLastFlipTick: 1,
    sentimentUpdatedAt: new Date(),
  } as unknown as AssetState
}

function makeMockPrisma() {
  return {
    asset: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  }
}

describe('SentimentWriter — toggle sentimentCalc', () => {
  it('com sentimentCalc=false, tick() nao grava', async () => {
    const prisma = makeMockPrisma()
    const assetStates = new Map<string, AssetState>()
    assetStates.set('a1', makeAssetState('a1'))

    const writer = new SentimentWriter({
      prisma: prisma as any,
      assetStates,
      layersEnabled: { sentimentCalc: false },
    })

    // Avanca tickCounter alem da cadencia para garantir que gravaria se toggle estivesse on
    for (let i = 0; i < SENTIMENT_WRITE_CADENCE + 1; i++) {
      await writer.tick()
    }

    expect(prisma.asset.update).not.toHaveBeenCalled()
  })

  it('com sentimentCalc=true, tick() grava na cadencia', async () => {
    const prisma = makeMockPrisma()
    const assetStates = new Map<string, AssetState>()
    assetStates.set('a1', makeAssetState('a1'))

    const writer = new SentimentWriter({
      prisma: prisma as any,
      assetStates,
      layersEnabled: { sentimentCalc: true },
    })

    for (let i = 0; i < SENTIMENT_WRITE_CADENCE; i++) {
      await writer.tick()
    }

    expect(prisma.asset.update).toHaveBeenCalled()
  })

  it('com layersEnabled ausente (undefined), tick() grava normalmente', async () => {
    const prisma = makeMockPrisma()
    const assetStates = new Map<string, AssetState>()
    assetStates.set('a1', makeAssetState('a1'))

    const writer = new SentimentWriter({
      prisma: prisma as any,
      assetStates,
    })

    for (let i = 0; i < SENTIMENT_WRITE_CADENCE; i++) {
      await writer.tick()
    }

    expect(prisma.asset.update).toHaveBeenCalled()
  })

  it('updateLayersEnabled altera o gate em tempo de execucao', async () => {
    const prisma = makeMockPrisma()
    const assetStates = new Map<string, AssetState>()
    assetStates.set('a1', makeAssetState('a1'))

    const writer = new SentimentWriter({
      prisma: prisma as any,
      assetStates,
      layersEnabled: { sentimentCalc: true },
    })

    // Liga -> grava
    for (let i = 0; i < SENTIMENT_WRITE_CADENCE; i++) {
      await writer.tick()
    }
    const callsOn = prisma.asset.update.mock.calls.length
    expect(callsOn).toBeGreaterThan(0)

    // Desliga via update
    writer.updateLayersEnabled({ sentimentCalc: false })
    prisma.asset.update.mockClear()

    for (let i = 0; i < SENTIMENT_WRITE_CADENCE + 1; i++) {
      await writer.tick()
    }
    expect(prisma.asset.update).not.toHaveBeenCalled()
  })
})
