/**
 * @jest-environment node
 *
 * TODO:REMOVE debug instrumentation
 * (loop 06-17-motor-footstock-correcoes-variacoes / T0.1)
 *
 * Valida o log estruturado por tick atrás da flag MOTOR_TICK_DEBUG:
 * roda >= 100 ticks de >= 2 ativos com a flag ligada, dirigindo os MESMOS
 * produtores que o motor usa (agentes reais + camadas L3/L5 reais), e asserta
 * que todos os campos estão presentes, com timestamp e ticker, sem NaN/undefined
 * e sem vazar segredo/env.
 */

// Flag ligada via mock de env (evita REDIS_URL/DATABASE_URL obrigatórios).
jest.mock('../../config/env', () => ({ env: { MOTOR_TICK_DEBUG: true } }))

const mockDebug = jest.fn()
jest.mock('../../utils/logger', () => ({
  logger: { debug: mockDebug, info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import {
  buildTickDebugRecord,
  maybeEmitTickDebug,
  isTickDebugEnabled,
  effectiveDt,
  findLayerMetric,
  type TickDebugRecord,
  type TickDebugInput,
} from '../tickDebug'
import { agentOrchestrator, AssetCluster } from '../../agents/AgentOrchestrator'
import type { MarketContext } from '../../agents/BaseAgent'
import { L3_GARCHLite } from '../../engine/layers/L3_GARCHLite'
import { L5_KyleLambda } from '../../engine/layers/L5_KyleLambda'
import { getClusterParams } from '../../microstructure/clusters'
import type { AssetState } from '../../types/motor.types'

const EXPECTED_KEYS = [
  'ts',
  'ticker',
  'agentImpact',
  'syntheticVolume',
  'stateVolume',
  'pendingBuyVolume',
  'pendingSellVolume',
  'marketMakerDecision',
  'ofiState',
  'l5VolumeRatio',
  'garchLastReturn',
  'dtEffective',
] as const

// Tokens que jamais podem aparecer no registro serializado.
const FORBIDDEN_TOKENS = [
  'redis_url',
  'database_url',
  'password',
  'secret',
  'token',
  'postgres://',
  'redis://',
  'process.env',
]

function makeState(overrides: Partial<AssetState>): AssetState {
  return {
    id: 'a',
    ticker: 'TST',
    cluster: AssetCluster.A_TOP,
    state: 'SP',
    currentPrice: 10,
    openPrice: 10,
    highPrice: 10,
    lowPrice: 10,
    closePrice: 10,
    fairValue: 10,
    volume: 0,
    variance: 0,
    pendingBuyVolume: 0,
    pendingSellVolume: 0,
    isPaused: false,
    haltReason: null,
    haltResumeAt: null,
    newsImpact: 0,
    newsImpactTicks: 0,
    ofiState: 0,
    dailyVolAccum: 0,
    dailySigmaMultiplier: 1.0,
    volatilityMultiplier: 1.0,
    ...overrides,
  }
}

/** Coleta valores aninhados para checagem de NaN/undefined. */
function flattenNumbers(obj: unknown, acc: number[] = []): number[] {
  if (typeof obj === 'number') acc.push(obj)
  else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) flattenNumbers(v, acc)
  }
  return acc
}

describe('tickDebug — instrumentação por tick (flag ON)', () => {
  beforeEach(() => mockDebug.mockClear())

  it('flag refletida a partir do env', () => {
    expect(isTickDebugEnabled()).toBe(true)
  })

  it('effectiveDt usa o default-safe legacy (5/390) quando MOTOR_TICK_DT_SECONDS ausente', () => {
    const prev = process.env.MOTOR_TICK_DT_SECONDS
    delete process.env.MOTOR_TICK_DT_SECONDS
    // T3.3: default explícito legacy (1/390 ajustado ao tick de 10s), não mais 1.0 acidental.
    expect(effectiveDt()).toBeCloseTo(5 / 390, 12)
    process.env.MOTOR_TICK_DT_SECONDS = '0.5'
    expect(effectiveDt()).toBe(0.5)
    process.env.MOTOR_TICK_DT_SECONDS = 'lixo'
    // T3.4: override inválido nao lança mais — vira warn + fallback default-safe.
    // effectiveDt reporta o MESMO DT que as camadas usam (5/390), nunca o valor inválido.
    expect(effectiveDt()).toBeCloseTo(5 / 390, 12)
    if (prev === undefined) delete process.env.MOTOR_TICK_DT_SECONDS
    else process.env.MOTOR_TICK_DT_SECONDS = prev
  })

  it('findLayerMetric ignora valores não-finitos e ausentes', () => {
    expect(findLayerMetric([{ layer: 'X', deltaPrice: 0, metadata: { volumeRatio: 0.5 } }], 'volumeRatio')).toBe(0.5)
    expect(findLayerMetric([{ layer: 'X', deltaPrice: 0, metadata: { volumeRatio: NaN } }], 'volumeRatio')).toBe(0)
    expect(findLayerMetric([{ layer: 'X', deltaPrice: 0 }], 'volumeRatio')).toBe(0)
    expect(findLayerMetric([], 'volumeRatio')).toBe(0)
  })

  it('buildTickDebugRecord é defensivo contra NaN/undefined nos inputs', () => {
    const rec = buildTickDebugRecord({
      timestamp: Number.NaN as unknown as number,
      ticker: undefined as unknown as string,
      agentImpact: Number.NaN,
      syntheticVolume: undefined as unknown as number,
      stateVolume: Infinity,
      pendingBuyVolume: -Infinity,
      pendingSellVolume: undefined as unknown as number,
      marketMakerDecision: null,
      ofiState: Number.NaN,
      layerResults: [],
    } as TickDebugInput)
    for (const n of flattenNumbers(rec)) expect(Number.isFinite(n)).toBe(true)
    expect(rec.ticker).toBe('')
    expect(typeof rec.ts).toBe('string')
    expect(rec.marketMakerDecision).toBeNull()
  })

  it('roda >= 100 ticks x 2 ativos com a flag ligada e emite registros válidos', () => {
    const l3 = new L3_GARCHLite()
    const l5 = new L5_KyleLambda()

    const assets = [
      { assetId: 'asset-1', ticker: 'SANTOS', cluster: AssetCluster.A_TOP },
      { assetId: 'asset-2', ticker: 'XPTOFC', cluster: AssetCluster.B_ILLIQ },
    ]

    for (const a of assets) agentOrchestrator.initAsset(a.assetId, a.cluster)

    const states = new Map<string, AssetState>(
      assets.map((a) => [
        a.assetId,
        makeState({ id: a.assetId, ticker: a.ticker, cluster: a.cluster }),
      ]),
    )

    const TICKS = 120
    const collected: TickDebugRecord[] = []

    for (let t = 0; t < TICKS; t++) {
      for (const a of assets) {
        const state = states.get(a.assetId)!
        const params = getClusterParams(a.cluster)
        const noise = Math.sin(t / 3) * 0.8 // determinístico, varia de sinal

        // Ordens pendentes variando (alimenta L5 volumeRatio e OFI-like).
        state.pendingBuyVolume = (t % 7) * 10
        state.pendingSellVolume = (t % 5) * 8
        state.ofiState = (state.pendingBuyVolume - state.pendingSellVolume) * 0.001

        // Camadas reais produzem metadata.lastReturn (L3) e volumeRatio (L5).
        const l3Result = l3.applyLayer(state, params, noise)
        const l5Result = l5.applyLayer(state, params, noise)
        const layerResults = [l3Result, l5Result]

        // Agentes reais produzem impacto, volume sintético e decisão do MM.
        const ctx: MarketContext = {
          ticker: a.ticker,
          currentPrice: state.currentPrice,
          fairValue: state.fairValue,
          priceChange24h: state.openPrice > 0 ? (state.currentPrice - state.openPrice) / state.openPrice : 0,
          volume24h: state.volume,
          baseVolume: params.baseVolume,
          bid: state.currentPrice * 0.999,
          ask: state.currentPrice * 1.001,
          spread: state.currentPrice * 0.002,
          session: 'TRADING',
          volatilityMultiplier: 1.0,
        }
        const { impact, syntheticVolume, marketMakerDecision } = agentOrchestrator.tickAsset(a.assetId, ctx)

        const finalPrice = Math.max(0.01, state.currentPrice * (1 + impact))
        state.volume = state.volume + syntheticVolume
        state.currentPrice = finalPrice

        const record = maybeEmitTickDebug({
          timestamp: 1_700_000_000_000 + t * 10_000,
          ticker: a.ticker,
          agentImpact: impact,
          syntheticVolume,
          stateVolume: state.volume,
          pendingBuyVolume: state.pendingBuyVolume,
          pendingSellVolume: state.pendingSellVolume,
          marketMakerDecision,
          ofiState: state.ofiState,
          layerResults,
        })

        expect(record).not.toBeNull()
        collected.push(record as TickDebugRecord)
      }
    }

    agentOrchestrator.dispose()

    // >= 100 ticks x 2 ativos
    expect(collected.length).toBe(TICKS * assets.length)
    expect(collected.length).toBeGreaterThanOrEqual(200)
    expect(mockDebug).toHaveBeenCalledTimes(TICKS * assets.length)

    const tickersSeen = new Set(collected.map((r) => r.ticker))
    expect(tickersSeen.size).toBeGreaterThanOrEqual(2)

    for (const rec of collected) {
      // Todos os campos presentes (chaves exatas, sem campo extra vazado).
      expect(Object.keys(rec).sort()).toEqual([...EXPECTED_KEYS].sort())

      // timestamp e ticker presentes e não-vazios.
      expect(typeof rec.ts).toBe('string')
      expect(rec.ts.length).toBeGreaterThan(0)
      expect(typeof rec.ticker).toBe('string')
      expect(rec.ticker.length).toBeGreaterThan(0)

      // Sem NaN/undefined em nenhum número aninhado.
      for (const n of flattenNumbers(rec)) {
        expect(n).not.toBeNaN()
        expect(Number.isFinite(n)).toBe(true)
      }

      // marketMakerDecision: null OU objeto com campos válidos.
      if (rec.marketMakerDecision !== null) {
        expect(['BUY', 'SELL', 'HOLD']).toContain(rec.marketMakerDecision.side)
        expect(Number.isFinite(rec.marketMakerDecision.quantity)).toBe(true)
        expect(Number.isFinite(rec.marketMakerDecision.priceModifier)).toBe(true)
        expect(typeof rec.marketMakerDecision.reason).toBe('string')
      }

      // DT efetivo presente e positivo.
      expect(rec.dtEffective).toBeGreaterThan(0)

      // Sem vazar segredo/env: nenhum token proibido no registro serializado.
      const serialized = JSON.stringify(rec).toLowerCase()
      for (const token of FORBIDDEN_TOKENS) {
        expect(serialized).not.toContain(token)
      }
    }

    // Pelo menos um tick com volumeRatio > 0 (L5 realmente alimentado).
    expect(collected.some((r) => r.l5VolumeRatio > 0)).toBe(true)
    // O que foi emitido ao logger é o mesmo registro estruturado.
    const firstEmitted = JSON.parse(mockDebug.mock.calls[0][0])
    expect(firstEmitted.scope).toBe('tick-debug')
    expect(firstEmitted.ticker).toBe(collected[0].ticker)
  })
})
