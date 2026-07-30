/**
 * @jest-environment node
 *
 * Bookkeeping pós-tick da supressão de correlação intra-grupo (item 021, RB9 / critério 26).
 *
 * QUINTO arquivo em `motor/src/engine/`, fora da lista fechada de quatro que o critério 5
 * do runbook declarou. Autorizado EXPLICITAMENTE pelo operador no recovery de 2026-07-30,
 * para fechar duas ressalvas do `/loop:iteraction:review-executed-task`:
 *
 *   1. a derivação de grupos ativos existe duplicada (helper em CorrelationLayer.ts vs
 *      inline em MarketEngine.ts) e nada travava uma implementação contra a outra;
 *   2. as transições de notícia (injeção e expiração) no lado do PAR não tinham teste,
 *      então a janela de 1 tick era um comportamento não documentado por asserção.
 *
 * Este arquivo NÃO altera comportamento: ele trava o que existe hoje.
 */
import fs from 'node:fs'
import path from 'node:path'

import { correlationLayer, activeNewsGroupIds } from '../../CorrelationLayer'
import { PriceCalculator } from '../../PriceCalculator'
import type {
  ActiveNewsImpact,
  AssetState,
  ClusterParams,
  PreviousTickDelta,
} from '../../../types/motor.types'

const GROUP = 'group-derby-classico'
const OTHER_GROUP = 'group-outro-jogo'
/** 0.001 em preço 100 => efeito máximo 0.045, SOB o velocity cap de correlação (0.07). */
const UNIT = 0.001

const baseState = (overrides: Partial<AssetState> = {}): AssetState => ({
  id: 'asset-pal3',
  ticker: 'PAL3',
  cluster: 'A_TOP',
  state: 'SP',
  currentPrice: 100,
  openPrice: 100,
  highPrice: 100,
  lowPrice: 100,
  closePrice: 100,
  fairValue: 100,
  volume: 0,
  variance: 0.0001,
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
})

const makeNews = (
  correlationId: string,
  overrides: Partial<ActiveNewsImpact> = {}
): ActiveNewsImpact => ({
  newsId: `news-${correlationId}`,
  correlationId,
  magnitude: 0.6,
  durationTicks: 50,
  ticksRemaining: 40,
  qualityFlags: [],
  ...overrides,
})

const makeDelta = (
  deltaPercent: number,
  newsGroupIds?: string[]
): PreviousTickDelta => ({
  cluster: 'A_TOP',
  state: 'SP',
  deltaPercent,
  ...(newsGroupIds ? { newsGroupIds } : {}),
})

const baseParams = (): ClusterParams => ({
  cluster: 'A_TOP',
  baseVolume: 50000,
  drift: 0.0,
  theta: 0.12,
  sigma: 0.0018,
  garchAlpha: 0.12,
  garchBeta: 0.85,
  lambdaKyle: 0.0001,
  spread: 0.0005,
  maxTickChange: 0.0035,
  ofiDecay: 0.91,
  alphaOfi: 0.0005,
})

// ============================================================================
// 1. Paridade da derivação gêmea (helper da camada vs inline do MarketEngine)
// ============================================================================

/**
 * TRANSCRIÇÃO LITERAL do inline de `MarketEngine.ts` (bloco de bookkeeping pós-tick).
 *
 * Não é um import: o critério 5 fechou o diff daquele bloco sem import novo, então a
 * duplicação é deliberada. O teste `tripwire de drift` abaixo compara ESTA transcrição
 * com o texto real do arquivo, então ela não pode envelhecer em silêncio.
 */
const inlineDerivation = (state: AssetState): string[] => [
  ...new Set(
    (state.activeNewsImpacts ?? [])
      .filter((news) => news.ticksRemaining > 0 && !!news.correlationId)
      .map((news) => news.correlationId as string)
  ),
]

/** Texto normalizado do inline real, como esperado em disco. Espelha `inlineDerivation`. */
const EXPECTED_INLINE_SOURCE = [
  '...new Set(',
  '(state.activeNewsImpacts ?? [])',
  '.filter((news) => news.ticksRemaining > 0 && !!news.correlationId)',
  '.map((news) => news.correlationId as string)',
  '),',
].join(' ')

const normalize = (source: string): string => source.replace(/\s+/g, ' ').trim()

const readEngineSource = (file: string): string => {
  const candidates = [
    path.join(__dirname, '..', '..', file),
    path.join(process.cwd(), 'src', 'engine', file),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8')
  }
  throw new Error(`fonte não encontrada para ${file}: ${candidates.join(' | ')}`)
}

describe('bookkeeping pós-tick: derivação gêmea de newsGroupIds', () => {
  const fixtures: Array<{ nome: string; state: AssetState }> = [
    { nome: 'sem activeNewsImpacts (campo ausente)', state: baseState() },
    { nome: 'lista vazia', state: baseState({ activeNewsImpacts: [] }) },
    { nome: 'uma notícia ativa', state: baseState({ activeNewsImpacts: [makeNews(GROUP)] }) },
    {
      nome: 'duas notícias do MESMO grupo (dedup)',
      state: baseState({
        activeNewsImpacts: [makeNews(GROUP), makeNews(GROUP, { newsId: 'news-2' })],
      }),
    },
    {
      nome: 'dois grupos distintos',
      state: baseState({ activeNewsImpacts: [makeNews(GROUP), makeNews(OTHER_GROUP)] }),
    },
    {
      nome: 'notícia expirada (ticksRemaining === 0) é ignorada',
      state: baseState({ activeNewsImpacts: [makeNews(GROUP, { ticksRemaining: 0 })] }),
    },
    {
      nome: 'correlationId vazio é ignorado',
      state: baseState({ activeNewsImpacts: [makeNews('', { newsId: 'news-sem-grupo' })] }),
    },
    {
      nome: 'correlationId ausente é ignorado',
      state: baseState({
        activeNewsImpacts: [{ ...makeNews(GROUP), correlationId: undefined }],
      }),
    },
    {
      nome: 'ativa + expirada + vazia no mesmo ativo',
      state: baseState({
        activeNewsImpacts: [
          makeNews(GROUP),
          makeNews(OTHER_GROUP, { ticksRemaining: 0 }),
          makeNews('', { newsId: 'news-vazio' }),
        ],
      }),
    },
  ]

  test.each(fixtures)('paridade helper vs inline: $nome', ({ state }) => {
    const doHelper = [...activeNewsGroupIds(state)].sort()
    const doInline = inlineDerivation(state).sort()
    expect(doInline).toEqual(doHelper)
  })

  test('tripwire de drift: o inline real de MarketEngine.ts casa com a transcrição', () => {
    const source = readEngineSource('MarketEngine.ts')
    const bloco = /const newsGroupIds = \[([\s\S]*?)\n\s*\]/.exec(source)
    expect(bloco).not.toBeNull()
    // Se este expect falhar, MarketEngine.ts mudou a derivação: atualize
    // `inlineDerivation` + `EXPECTED_INLINE_SOURCE` aqui E o helper
    // `activeNewsGroupIds` em CorrelationLayer.ts. As três andam juntas.
    expect(normalize(bloco![1])).toBe(normalize(EXPECTED_INLINE_SOURCE))
  })

  test('tripwire de drift: o helper da camada mantém o mesmo predicado', () => {
    const source = readEngineSource('CorrelationLayer.ts')
    expect(normalize(source)).toContain(
      normalize('if (news.ticksRemaining > 0 && news.correlationId) groups.add(news.correlationId)')
    )
  })

  test('o inline é o ÚNICO produtor de previousTickDeltas no motor', () => {
    const source = readEngineSource('MarketEngine.ts')
    const setters = source.match(/previousTickDeltas\.set\(/g) ?? []
    expect(setters).toHaveLength(1)
  })
})

// ============================================================================
// 2. Transições de notícia no lado do PAR (janela declarada de 1 tick)
// ============================================================================

describe('transições de notícia no par', () => {
  const own = (): AssetState =>
    baseState({ activeNewsImpacts: [makeNews(GROUP)] })

  const peerId = 'asset-uru3'

  test('tick da INJEÇÃO: par ainda não etiquetado, então correlaciona (janela de 1 tick)', () => {
    // No tick em que a notícia entra, o bookkeeping pós-tick ainda não rodou desde a
    // injeção, então o `PreviousTickDelta` do par não carrega `newsGroupIds`. O delta
    // correlacionado aqui é PRE-notícia: não há sinal de notícia para cancelar, logo o
    // RB9 não materializa. Comportamento DECLARADO, travado por asserção.
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-pal3', makeDelta(0)],
      [peerId, makeDelta(-UNIT)],
    ])
    const r = correlationLayer.compute(own(), deltas)
    expect(r.suppressedPeers).toBe(0)
    expect(r.suppressedGroups).toEqual([])
    expect(r.clusterPeers).toBe(1)
    expect(r.delta).toBeCloseTo(-(0.35 + 0.10) * UNIT * 100, 12)
  })

  test('tick SEGUINTE: par já etiquetado pelo bookkeeping, então é suprimido', () => {
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-pal3', makeDelta(0, [GROUP])],
      [peerId, makeDelta(-UNIT, [GROUP])],
    ])
    const r = correlationLayer.compute(own(), deltas)
    expect(r.suppressedPeers).toBe(1)
    expect(r.suppressedGroups).toEqual([GROUP])
    expect(r.clusterPeers).toBe(0)
    expect(r.regionalPeers).toBe(0)
    expect(r.delta).toBe(0)
  })

  test('tick da EXPIRAÇÃO do par: bookkeeping deixa de etiquetar e o par volta a correlacionar', () => {
    // O bookkeeping filtra `ticksRemaining > 0`, então na expiração o par sai sem
    // `newsGroupIds` — provado pela paridade da derivação acima com o fixture
    // "notícia expirada é ignorada".
    const peerExpirado = baseState({
      id: peerId,
      ticker: 'URU3',
      activeNewsImpacts: [makeNews(GROUP, { ticksRemaining: 0 })],
    })
    expect(inlineDerivation(peerExpirado)).toEqual([])

    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-pal3', makeDelta(0, [GROUP])],
      [peerId, makeDelta(-UNIT)],
    ])
    const r = correlationLayer.compute(own(), deltas)
    expect(r.suppressedPeers).toBe(0)
    expect(r.clusterPeers).toBe(1)
    expect(r.delta).toBeCloseTo(-(0.35 + 0.10) * UNIT * 100, 12)
  })

  test('notícia expirada no ativo CORRENTE não suprime, mesmo com o par etiquetado', () => {
    const ownExpirado = baseState({
      activeNewsImpacts: [makeNews(GROUP, { ticksRemaining: 0 })],
    })
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-pal3', makeDelta(0)],
      [peerId, makeDelta(-UNIT, [GROUP])],
    ])
    const r = correlationLayer.compute(ownExpirado, deltas)
    expect(r.suppressedPeers).toBe(0)
    expect(r.clusterPeers).toBe(1)
    expect(r.delta).toBeCloseTo(-(0.35 + 0.10) * UNIT * 100, 12)
  })

  test('par de OUTRO grupo continua correlacionando na janela e depois dela', () => {
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-pal3', makeDelta(0, [GROUP])],
      [peerId, makeDelta(-UNIT, [OTHER_GROUP])],
    ])
    const r = correlationLayer.compute(own(), deltas)
    expect(r.suppressedPeers).toBe(0)
    expect(r.clusterPeers).toBe(1)
    expect(r.delta).toBeCloseTo(-(0.35 + 0.10) * UNIT * 100, 12)
  })
})

// ============================================================================
// 3. Zero Silêncio: L10 aflora quando a supressão ZERA a correlação
// ============================================================================

describe('L10_Correlation com supressão total (Zero Silêncio)', () => {
  const calculator = new PriceCalculator()

  const findL10 = <T extends { layer: string }>(layerResults: T[]): T | undefined =>
    layerResults.find((r) => r.layer === 'L10_Correlation')

  test('supressão total emite LayerResult com deltaPrice 0 e contadores visíveis', () => {
    const state = baseState({ activeNewsImpacts: [makeNews(GROUP)] })
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-pal3', makeDelta(0, [GROUP])],
      ['asset-uru3', makeDelta(-UNIT, [GROUP])],
    ])

    const result = calculator.calculate(state, baseParams(), 0, deltas)
    const l10 = findL10(result.layerResults)

    // Antes do recovery de 2026-07-30 este expect falhava: a guarda era
    // `correlationDelta !== 0` e o LayerResult desaparecia justamente aqui.
    expect(l10).toBeDefined()
    expect(l10!.deltaPrice).toBe(0)
    expect(l10!.metadata?.suppressedPeers).toBe(1)
    expect(l10!.metadata?.suppressedGroups).toBe(GROUP)
  })

  test('sem supressão e sem correlação, L10 continua ausente (guarda preservada)', () => {
    const state = baseState()
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-pal3', makeDelta(0)],
      ['asset-uru3', makeDelta(0)],
    ])

    const result = calculator.calculate(state, baseParams(), 0, deltas)
    expect(findL10(result.layerResults)).toBeUndefined()
  })

  test('correlação não nula continua emitindo L10 com contadores zerados no caminho legado', () => {
    const state = baseState()
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-pal3', makeDelta(0)],
      ['asset-uru3', makeDelta(-UNIT)],
    ])

    const result = calculator.calculate(state, baseParams(), 0, deltas)
    const l10 = findL10(result.layerResults)
    expect(l10).toBeDefined()
    expect(l10!.deltaPrice).not.toBe(0)
    expect(l10!.metadata?.suppressedPeers).toBe(0)
    expect(l10!.metadata?.suppressedGroups).toBe('')
  })
})
