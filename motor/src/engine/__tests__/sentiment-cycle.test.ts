// Liga do sentimento ao motor (2026-11-16): SentimentCycle (calculo) +
// SentimentWriter (gravacao, heartbeat). O calculador puro tem suite propria
// em sentiment-calculator-deterministic.test.ts.

import {
  SentimentCycle,
  computeMomentumComponents,
  SENTIMENT_WEIGHTS,
  NEWS_WINDOW_REFRESH_TICKS,
  MOMENTUM_MIN_HORIZON_TICKS,
  type MomentumInput,
} from '../SentimentCycle'
import { SentimentWriter, SENTIMENT_WRITE_CADENCE } from '../SentimentWriter'
import type { AssetState } from '../../types/motor.types'

function makeState(id: string, over: Partial<AssetState> = {}): AssetState {
  return {
    id,
    ticker: `TK${id}`,
    cluster: 'A_TOP',
    currentPrice: 10,
    closePrice: 10,
    openPrice: 10,
    variance: 0.0004,
    isPaused: false,
    sentimentScore: 0,
    sentimentLabel: 'NEUTRAL',
    sentimentReason: null,
    sentimentComponents: null,
    sentimentLastFlipTick: 0,
    activeNewsImpacts: [],
    ...over,
  } as unknown as AssetState
}

function newsRow(ticker: string, sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL', i: number) {
  const at = new Date('2026-11-16T12:00:00Z')
  return { id: `${ticker}-${i}`, ticker, sentiment, publishedAt: at, sentimentClassifiedAt: at }
}

function makePrisma(rows: ReturnType<typeof newsRow>[] = []) {
  return {
    news: {
      findMany: jest.fn().mockResolvedValue(rows),
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    asset: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  }
}

describe('computeMomentumComponents', () => {
  const base = (id: string, price: number, cluster = 'A_TOP'): MomentumInput => ({
    id,
    cluster,
    currentPrice: price,
    closePrice: 10,
    variance: 0.0001,
    horizonTicks: MOMENTUM_MIN_HORIZON_TICKS,
  })

  it('ativo acima da mediana do cluster tem momentum positivo, abaixo negativo', () => {
    const out = computeMomentumComponents([base('a', 10.3), base('b', 10), base('c', 9.7)])
    expect(out.get('a')!.value).toBeGreaterThan(0)
    expect(out.get('b')!.value).toBeCloseTo(0, 6)
    expect(out.get('c')!.value).toBeLessThan(0)
  })

  it('mercado subindo junto nao gera momentum relativo', () => {
    const out = computeMomentumComponents([base('a', 10.5), base('b', 10.5), base('c', 10.5)])
    for (const id of ['a', 'b', 'c']) expect(out.get(id)!.value).toBeCloseTo(0, 6)
  })

  it('satura em +-1', () => {
    const out = computeMomentumComponents([base('a', 20), base('b', 10), base('c', 5)])
    expect(out.get('a')!.value).toBe(1)
    expect(out.get('c')!.value).toBe(-1)
  })

  it('cluster com um ativo usa a mediana do mercado', () => {
    const out = computeMomentumComponents([
      base('solo', 10.4, 'B_ILLIQ'),
      base('x', 10),
      base('y', 10),
    ])
    expect(out.get('solo')!.peerMedian).toBeCloseTo(0, 9)
    expect(out.get('solo')!.value).toBeGreaterThan(0)
  })

  it('variancia zero, preco invalido e NaN viram 0, nunca NaN', () => {
    const out = computeMomentumComponents([
      { ...base('a', 10.5), variance: 0 },
      { ...base('b', 0) },
      { ...base('c', 10.2), variance: Number.NaN },
    ])
    for (const id of ['a', 'b', 'c']) {
      expect(Number.isFinite(out.get(id)!.value)).toBe(true)
      expect(out.get(id)!.value).toBe(0)
    }
  })
})

describe('SentimentCycle', () => {
  it('pesos: noticia (A+F) 0.45, momentum 0.35, fluxo desligado', () => {
    expect(SENTIMENT_WEIGHTS.A + SENTIMENT_WEIGHTS.F).toBeCloseTo(0.45)
    expect(SENTIMENT_WEIGHTS.B).toBe(0.35)
    expect(SENTIMENT_WEIGHTS.C).toBe(0)
  })

  it('noticias BULLISH puxam o score para cima e gravam os insumos nos componentes', async () => {
    const rows = [1, 2, 3, 4, 5, 6].map(i => newsRow('TKa', 'BULLISH', i))
    const prisma = makePrisma(rows)
    const states = new Map([
      ['a', makeState('a')],
      ['b', makeState('b')],
    ])
    const cycle = new SentimentCycle({ prisma: prisma as any, assetStates: states })

    await cycle.run(100, 'TRADING')

    const a = states.get('a')!
    const b = states.get('b')!
    expect(a.sentimentScore!).toBeGreaterThan(0)
    expect(b.sentimentScore).toBe(0)
    const inputs = (a.sentimentComponents as any).inputs
    expect(inputs.news.bullish).toBe(6)
    expect(typeof a.sentimentReason).toBe('string')
  })

  it('com sinal sustentado o rotulo vira BULLISH e grava o tick do flip', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => newsRow('TKa', 'BULLISH', i))
    const prisma = makePrisma(rows)
    const states = new Map([
      ['a', makeState('a', { currentPrice: 10.6 })],
      ['b', makeState('b')],
      ['c', makeState('c', { currentPrice: 9.9 })],
    ])
    const cycle = new SentimentCycle({ prisma: prisma as any, assetStates: states })

    for (
      let t = SENTIMENT_WRITE_CADENCE;
      t <= 40 * SENTIMENT_WRITE_CADENCE;
      t += SENTIMENT_WRITE_CADENCE
    ) {
      await cycle.run(t, 'TRADING')
    }
    const a = states.get('a')!
    expect(a.sentimentLabel).toBe('BULLISH')
    expect(a.sentimentLastFlipTick).toBeGreaterThan(0)
  })

  it('sessao CLOSED congela: nao calcula nem consulta o banco', async () => {
    const prisma = makePrisma([newsRow('TKa', 'BEARISH', 1)])
    const states = new Map([
      ['a', makeState('a', { sentimentScore: 0.42, sentimentLabel: 'BULLISH' })],
    ])
    const cycle = new SentimentCycle({ prisma: prisma as any, assetStates: states })

    await cycle.run(100, 'CLOSED')

    expect(prisma.news.findMany).not.toHaveBeenCalled()
    expect(states.get('a')!.sentimentScore).toBe(0.42)
    expect(states.get('a')!.sentimentLabel).toBe('BULLISH')
  })

  it('ativo pausado (halt) nao e recalculado', async () => {
    const prisma = makePrisma(Array.from({ length: 10 }, (_, i) => newsRow('TKa', 'BEARISH', i)))
    const states = new Map([
      ['a', makeState('a', { isPaused: true, sentimentScore: 0.3, sentimentLabel: 'BULLISH' })],
    ])
    const cycle = new SentimentCycle({ prisma: prisma as any, assetStates: states })

    await cycle.run(100, 'TRADING')

    expect(states.get('a')!.sentimentScore).toBe(0.3)
    expect(states.get('a')!.sentimentLabel).toBe('BULLISH')
  })

  it('recarrega a janela de noticias so a cada NEWS_WINDOW_REFRESH_TICKS', async () => {
    const prisma = makePrisma()
    const states = new Map([['a', makeState('a')]])
    const cycle = new SentimentCycle({ prisma: prisma as any, assetStates: states })

    await cycle.run(6, 'TRADING')
    await cycle.run(12, 'TRADING')
    expect(prisma.news.findMany).toHaveBeenCalledTimes(1)
    await cycle.run(6 + NEWS_WINDOW_REFRESH_TICKS, 'TRADING')
    expect(prisma.news.findMany).toHaveBeenCalledTimes(2)
  })

  it('falha no banco mantem o cache anterior e nao lanca', async () => {
    const prisma = makePrisma([newsRow('TKa', 'BULLISH', 1)])
    prisma.news.findMany.mockRejectedValueOnce(new Error('db fora'))
    const states = new Map([['a', makeState('a')]])
    const cycle = new SentimentCycle({ prisma: prisma as any, assetStates: states })

    await expect(cycle.run(6, 'TRADING')).resolves.toBeUndefined()
    // proxima cadencia tenta de novo (nao marcou refresh)
    await cycle.run(12, 'TRADING')
    expect(prisma.news.findMany).toHaveBeenCalledTimes(2)
  })

  it('magnitude de noticia rapida (fracao do preco) e normalizada para direcao', async () => {
    const prisma = makePrisma()
    const impact = { magnitude: -0.05, durationTicks: 50, ticksRemaining: 40 }
    const states = new Map([
      ['a', makeState('a', { activeNewsImpacts: [impact, impact, impact, impact, impact] as any })],
    ])
    const cycle = new SentimentCycle({ prisma: prisma as any, assetStates: states })

    await cycle.run(6, 'TRADING')

    const comps = states.get('a')!.sentimentComponents as any
    expect(comps.F.value).toBeCloseTo(-1)
    expect(states.get('a')!.sentimentScore!).toBeLessThan(0)
  })
})

describe('SentimentWriter com ciclo e heartbeat', () => {
  async function runCadence(
    writer: SentimentWriter,
    sessionType: 'TRADING' | 'CLOSED' = 'TRADING'
  ) {
    for (let i = 1; i <= SENTIMENT_WRITE_CADENCE; i++) {
      await writer.tick({ tickCount: i, sessionType })
    }
  }

  it('calcula antes de gravar na cadencia', async () => {
    const prisma = makePrisma()
    const states = new Map([['a', makeState('a')]])
    const run = jest.fn().mockResolvedValue(undefined)
    const writer = new SentimentWriter({
      prisma: prisma as any,
      assetStates: states,
      cycle: { run },
    })

    await runCadence(writer)

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(SENTIMENT_WRITE_CADENCE, 'TRADING')
    expect(run.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.asset.update.mock.invocationCallOrder[0]
    )
  })

  it('heartbeat grava sentimentUpdatedAt dos nao pausados que nao mudaram', async () => {
    const prisma = makePrisma()
    const states = new Map([
      ['a', makeState('a')],
      ['b', makeState('b')],
      ['p', makeState('p', { isPaused: true })],
    ])
    const writer = new SentimentWriter({ prisma: prisma as any, assetStates: states })

    // 1a cadencia: todos dirty (primeira gravacao) -> update, heartbeat sem ids
    await runCadence(writer)
    expect(prisma.asset.update).toHaveBeenCalledTimes(2)
    expect(prisma.asset.updateMany).not.toHaveBeenCalled()

    // 2a cadencia: nada mudou -> so heartbeat de a e b
    await runCadence(writer)
    expect(prisma.asset.update).toHaveBeenCalledTimes(2)
    expect(prisma.asset.updateMany).toHaveBeenCalledTimes(1)
    const arg = prisma.asset.updateMany.mock.calls[0][0]
    expect(arg.where.id.in.sort()).toEqual(['a', 'b'])
    expect(arg.data.sentimentUpdatedAt).toBeInstanceOf(Date)
    expect(Object.keys(arg.data)).toEqual(['sentimentUpdatedAt'])
  })

  it('sentimentLastFlipAt so e gravado quando ha flip novo', async () => {
    const prisma = makePrisma()
    const states = new Map([['a', makeState('a', { sentimentLastFlipTick: 3 })]])
    const writer = new SentimentWriter({ prisma: prisma as any, assetStates: states })

    await runCadence(writer)
    expect(prisma.asset.update.mock.calls[0][0].data.sentimentLastFlipAt).toBeInstanceOf(Date)

    // score muda sem flip -> regrava sem tocar sentimentLastFlipAt
    states.get('a')!.sentimentScore = 0.15
    await runCadence(writer)
    expect(prisma.asset.update.mock.calls[1][0].data.sentimentLastFlipAt).toBeUndefined()
  })

  it('erro no ciclo nao propaga', async () => {
    const prisma = makePrisma()
    const states = new Map([['a', makeState('a')]])
    const run = jest.fn().mockRejectedValue(new Error('boom'))
    const writer = new SentimentWriter({
      prisma: prisma as any,
      assetStates: states,
      cycle: { run },
    })

    await expect(runCadence(writer)).resolves.toBeUndefined()
  })
})
