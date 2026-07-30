/**
 * @jest-environment node
 */
import { CorrelationLayer, correlationLayer, activeNewsGroupIds } from '../../CorrelationLayer'
import type { ActiveNewsImpact, AssetState, PreviousTickDelta } from '../../../types/motor.types'

const baseState = (overrides: Partial<AssetState> = {}): AssetState => ({
  id: 'asset-001',
  ticker: 'FLM3',
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

const makeDelta = (
  cluster: string,
  state: string,
  deltaPercent: number,
  // Grupos de notícia ativos do PAR no fim do tick anterior. É o contrato que
  // MarketEngine preenche no bookkeeping pós-tick; ausente = par sem notícia de grupo.
  newsGroupIds?: string[]
): PreviousTickDelta => ({
  cluster: cluster as PreviousTickDelta['cluster'],
  state,
  deltaPercent,
  ...(newsGroupIds ? { newsGroupIds } : {}),
})

/** Notícia ativa mínima: só `correlationId` (= groupId, por F9) e o countdown importam. */
const makeNews = (correlationId: string, overrides: Partial<ActiveNewsImpact> = {}): ActiveNewsImpact => ({
  newsId: `news-${correlationId}`,
  correlationId,
  magnitude: 0.6,
  durationTicks: 50,
  ticksRemaining: 40,
  qualityFlags: [],
  ...overrides,
})

describe('CorrelationLayer', () => {
  const cl = new CorrelationLayer()

  test('sem pares: delta = 0', () => {
    const state   = baseState()
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0.01)],  // só o próprio ativo
    ])
    const result = cl.compute(state, deltas)
    expect(result.delta).toBe(0)
    expect(result.clusterPeers).toBe(0)
  })

  test('pares do mesmo cluster contribuem com correlação positiva', () => {
    const state   = baseState()
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0.01)],
      ['asset-002', makeDelta('A_TOP', 'RJ', 0.02)],  // mesmo cluster, diferente estado
      ['asset-003', makeDelta('A_TOP', 'MG', 0.01)],
    ])
    const result = cl.compute(state, deltas)
    // Pares subiram → correlação positiva → delta > 0
    expect(result.delta).toBeGreaterThan(0)
    expect(result.clusterPeers).toBe(2)
  })

  test('pares do mesmo cluster com queda: delta negativo', () => {
    const state   = baseState()
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', -0.01)],
      ['asset-002', makeDelta('A_TOP', 'RJ', -0.02)],
      ['asset-003', makeDelta('A_TOP', 'MG', -0.01)],
    ])
    const result = cl.compute(state, deltas)
    expect(result.delta).toBeLessThan(0)
  })

  test('clusters diferentes NÃO se correlacionam', () => {
    const state   = baseState({ cluster: 'A_TOP' })
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0)],
      ['asset-002', makeDelta('B_ILLIQ', 'SP', 0.50)],  // cluster diferente, grande movimento
    ])
    const result = cl.compute(state, deltas)
    // B_ILLIQ não correlaciona com A_TOP
    expect(result.clusterPeers).toBe(0)
  })

  test('correlação regional: mesmo estado adiciona delta extra', () => {
    const state = baseState({ state: 'SP' })
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0)],
      ['asset-002', makeDelta('A_MID', 'SP', 0.01)],   // mesmo estado, diferente cluster
    ])
    const result = cl.compute(state, deltas)
    // Apenas correlação regional (sem cluster peers)
    expect(result.regionalPeers).toBeGreaterThan(0)
  })

  test('delta de correlação respeita velocity cap (~0.07% do preço)', () => {
    const state   = baseState({ currentPrice: 100 })
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0)],
      ['asset-002', makeDelta('A_TOP', 'RJ', 1.0)],    // 100% de variação — extremo
    ])
    const result = cl.compute(state, deltas)
    // Cap: ~0.07% de 100 = 0.07
    expect(Math.abs(result.delta)).toBeLessThanOrEqual(0.07 + 1e-10)
  })

  test('singleton correlationLayer funciona como instância compartilhada', () => {
    const state  = baseState()
    const deltas = new Map<string, PreviousTickDelta>()
    const result = correlationLayer.compute(state, deltas)
    expect(result.delta).toBe(0)
  })

  test('rho por cluster: A_TOP=0.35, A_SMALL=0.08, B_ILLIQ=0.05', () => {
    const stateA = baseState({ cluster: 'A_TOP' })
    const stateS = baseState({ cluster: 'A_SMALL' })
    const stateB = baseState({ cluster: 'B_ILLIQ' })

    const deltasA = new Map([
      ['own', makeDelta('A_TOP',   'SP', 0)],
      ['p1',  makeDelta('A_TOP',   'RJ', 0.01)],
    ])
    const deltasS = new Map([
      ['own', makeDelta('A_SMALL', 'SP', 0)],
      ['p1',  makeDelta('A_SMALL', 'RJ', 0.01)],
    ])
    const deltasB = new Map([
      ['own', makeDelta('B_ILLIQ', 'SP', 0)],
      ['p1',  makeDelta('B_ILLIQ', 'RJ', 0.01)],
    ])

    const rA = cl.compute(stateA, deltasA)
    const rS = cl.compute(stateS, deltasS)
    const rB = cl.compute(stateB, deltasB)

    // A_TOP tem rho maior → delta maior que A_SMALL e B_ILLIQ
    expect(rA.clusterRho).toBe(0.35)
    expect(rS.clusterRho).toBe(0.08)
    expect(rB.clusterRho).toBe(0.05)
  })
})

// ============================================================================
// Supressão de correlação intra-grupo (item 021 — critérios 26 e 27, H7, RB9).
//
// Cenário canônico: notícia multi-time de UM grupo com sentimento POR TIME. PAL3
// recebe o lado positivo, URU3 o lado negativo, os dois no mesmo cluster e na mesma
// UF (é o caso pior: correlação de cluster E regional ao mesmo tempo). Sem supressão,
// a correlação faria os dois lados se cancelarem parcialmente — o risco RB9.
//
// O grupo é identificado pelo `correlationId` que `ActiveNewsImpact` já carrega e que
// passa a transportar o `groupId` (F9). ZERO campo novo no contrato `news:inject`.
//
// Magnitudes escolhidas para ficarem SOB o velocity cap (0.07 em preço 100): com o
// cap ativo os dois cenários saturariam no mesmo valor e o teste passaria por engano.
// ============================================================================
describe('CorrelationLayer — supressão intra-grupo (critério 26)', () => {
  const cl = new CorrelationLayer()

  const GROUP = 'group-derby-classico'
  const OTHER_GROUP = 'group-outro-jogo'
  const UNIT = 0.001  // 45 × 0.001 × 100 = 0.045 < cap 0.07

  /** PAL3 com o lado POSITIVO da notícia do grupo. */
  const pal3 = (news: ActiveNewsImpact[] | undefined) =>
    baseState({ id: 'asset-pal3', ticker: 'PAL3', cluster: 'A_TOP', state: 'SP', activeNewsImpacts: news })

  /** Mesmo ativo SEM notícia nenhuma: é o controle do caminho legado. */
  const pal3Legacy = () => pal3(undefined)

  const own = makeDelta('A_TOP', 'SP', 0)
  /** URU3: lado NEGATIVO da MESMA notícia de grupo. */
  const uru3 = makeDelta('A_TOP', 'SP', -UNIT, [GROUP])
  /** Terceiro ativo do mesmo cluster e UF, sem notícia de grupo. */
  const outsider = makeDelta('A_TOP', 'SP', UNIT)

  const mapWithUru3 = () => new Map<string, PreviousTickDelta>([
    ['asset-pal3', own],
    ['asset-uru3', uru3],
    ['asset-out', outsider],
  ])
  const mapWithoutUru3 = () => new Map<string, PreviousTickDelta>([
    ['asset-pal3', own],
    ['asset-out', outsider],
  ])

  // ── CASO 1 — critério 26: o par do mesmo grupo é excluído das DUAS médias ──
  test('[CRITERIO 26] par do mesmo grupo nao entra em nenhuma das duas medias', () => {
    const suppressed = cl.compute(pal3([makeNews(GROUP)]), mapWithUru3())
    const asIfAbsent = cl.compute(pal3([makeNews(GROUP)]), mapWithoutUru3())

    // Idêntico ao cenário em que URU3 simplesmente não existe no mapa.
    expect(suppressed.delta).toBeCloseTo(asIfAbsent.delta, 12)
    expect(suppressed.clusterPeers).toBe(asIfAbsent.clusterPeers)
    expect(suppressed.regionalPeers).toBe(asIfAbsent.regionalPeers)

    // URU3 saiu das duas médias: sobrou só o outsider em cada uma.
    expect(suppressed.clusterPeers).toBe(1)
    expect(suppressed.regionalPeers).toBe(1)

    // Observabilidade (Zero Silêncio): a supressão é contável e nomeia o grupo.
    expect(suppressed.suppressedPeers).toBe(1)
    expect(suppressed.suppressedGroups).toEqual([GROUP])

    // E o valor NÃO está saturado no cap — a igualdade acima não é artefato do clamp.
    expect(Math.abs(suppressed.delta)).toBeLessThan(100 * 0.0007)
  })

  // ── CASO 2 — RB9 concreto: sinais opostos não se cancelam ──
  test('[RB9] sinal negativo do irmao de grupo nao reduz o sinal positivo do ativo', () => {
    const onlyUru3 = new Map<string, PreviousTickDelta>([
      ['asset-pal3', own],
      ['asset-uru3', uru3],
    ])

    const suppressed = cl.compute(pal3([makeNews(GROUP)]), onlyUru3)
    const unsuppressed = cl.compute(pal3Legacy(), onlyUru3)

    // Sem supressão, o -0.1% de URU3 puxaria PAL3 para BAIXO.
    expect(unsuppressed.delta).toBeLessThan(0)
    expect(unsuppressed.delta).toBeCloseTo(-(0.35 + 0.10) * UNIT * 100, 12)

    // Com supressão, nada puxa: o lado positivo de PAL3 fica intacto.
    expect(suppressed.delta).toBe(0)
    expect(suppressed.clusterPeers).toBe(0)
    expect(suppressed.regionalPeers).toBe(0)
    expect(suppressed.suppressedPeers).toBe(1)
  })

  // ── CASO 3 — ativo fora do grupo continua correlacionando ──
  test('terceiro ativo fora do grupo contribui exatamente como hoje', () => {
    const suppressed = cl.compute(pal3([makeNews(GROUP)]), mapWithUru3())
    // Referência: caminho legado com SÓ o outsider no mapa, zero supressão envolvida.
    const legacyOutsiderOnly = cl.compute(pal3Legacy(), mapWithoutUru3())

    expect(suppressed.delta).toBeCloseTo(legacyOutsiderOnly.delta, 12)
    expect(suppressed.delta).toBeCloseTo((0.35 + 0.10) * UNIT * 100, 12)
  })

  test('par com noticia de OUTRO grupo continua correlacionando', () => {
    const map = new Map<string, PreviousTickDelta>([
      ['asset-pal3', own],
      ['asset-outro', makeDelta('A_TOP', 'SP', UNIT, [OTHER_GROUP])],
    ])
    const result = cl.compute(pal3([makeNews(GROUP)]), map)

    expect(result.suppressedPeers).toBe(0)
    expect(result.suppressedGroups).toEqual([])
    expect(result.clusterPeers).toBe(1)
    expect(result.delta).toBeCloseTo((0.35 + 0.10) * UNIT * 100, 12)
  })

  test('supressao multi-grupo: cada grupo compartilhado e nomeado uma vez', () => {
    const map = new Map<string, PreviousTickDelta>([
      ['asset-pal3', own],
      ['asset-uru3', makeDelta('A_TOP', 'SP', -UNIT, [GROUP])],
      ['asset-cor3', makeDelta('A_TOP', 'SP', -UNIT, [OTHER_GROUP, GROUP])],
      ['asset-out', outsider],
    ])
    const result = cl.compute(pal3([makeNews(GROUP), makeNews(OTHER_GROUP)]), map)

    expect(result.suppressedPeers).toBe(2)
    expect(result.suppressedGroups.slice().sort()).toEqual([GROUP, OTHER_GROUP].slice().sort())
    expect(result.clusterPeers).toBe(1)  // só o outsider sobrou
  })

  // ── CASO 4 — regressão do caminho legado (critério 17 na parte de motor) ──
  test('[CRITERIO 17] ativo sem activeNewsImpacts: resultado identico e contadores zerados', () => {
    const undefinedNews = cl.compute(pal3Legacy(), mapWithUru3())
    const emptyNews = cl.compute(pal3([]), mapWithUru3())

    // Lista ausente e lista vazia são o mesmo estado: sem notícia, sem supressão.
    expect(emptyNews).toEqual(undefinedNews)

    // Os dois pares continuam nas duas médias, como antes desta camada existir.
    expect(undefinedNews.clusterPeers).toBe(2)
    expect(undefinedNews.regionalPeers).toBe(2)
    expect(undefinedNews.suppressedPeers).toBe(0)
    expect(undefinedNews.suppressedGroups).toEqual([])
  })

  test('[CRITERIO 17] par COM grupo ativo nao e suprimido se o ativo corrente nao tem noticia', () => {
    // Notícia de time único (groupId === newsId, DB-03) num par, ativo corrente limpo:
    // nada a intersectar, nada suprimido. É o caso de todo dia em produção hoje.
    const result = cl.compute(pal3Legacy(), mapWithUru3())
    expect(result.suppressedPeers).toBe(0)
    expect(result.clusterPeers).toBe(2)
  })

  test('caminho legado preserva os campos originais de CorrelationResult', () => {
    const result = cl.compute(pal3Legacy(), mapWithoutUru3())
    expect(result.clusterRho).toBe(0.35)
    expect(result.regionalRho).toBe(0.10)
    expect(result.clusterPeers).toBe(1)
    expect(result.regionalPeers).toBe(1)
  })

  // ── CASO 5 — notícia expirada não suprime (risco de grupo fantasma) ──
  test('noticia expirada no ativo corrente nao suprime (ticksRemaining === 0)', () => {
    const expired = cl.compute(pal3([makeNews(GROUP, { ticksRemaining: 0 })]), mapWithUru3())
    const legacy = cl.compute(pal3Legacy(), mapWithUru3())

    expect(expired).toEqual(legacy)
    expect(expired.suppressedPeers).toBe(0)
    expect(expired.clusterPeers).toBe(2)
  })

  test('derivacao de grupos ignora noticia expirada e correlationId vazio', () => {
    // Contrato que MarketEngine implementa inline ao montar `newsGroupIds` do par:
    // notícia expirada não pode transportar grupo para o tick seguinte.
    expect(activeNewsGroupIds(pal3([makeNews(GROUP, { ticksRemaining: 0 })]))).toEqual(new Set())
    expect(activeNewsGroupIds(pal3([makeNews(GROUP, { correlationId: '' })]))).toEqual(new Set())
    expect(activeNewsGroupIds(pal3(undefined))).toEqual(new Set())

    // Ativas são deduplicadas: duas notícias do mesmo grupo contam como um grupo.
    expect(activeNewsGroupIds(pal3([makeNews(GROUP), makeNews(GROUP)]))).toEqual(new Set([GROUP]))
    expect(activeNewsGroupIds(pal3([makeNews(GROUP), makeNews(OTHER_GROUP)]))).toEqual(
      new Set([GROUP, OTHER_GROUP])
    )
  })

  test('par sem newsGroupIds nunca e suprimido, mesmo com o ativo corrente em grupo', () => {
    // Campo opcional ausente = par legacy. Compatibilidade com todo produtor anterior.
    const map = new Map<string, PreviousTickDelta>([
      ['asset-pal3', own],
      ['asset-legacy', makeDelta('A_TOP', 'SP', UNIT)],
    ])
    const result = cl.compute(pal3([makeNews(GROUP)]), map)
    expect(result.suppressedPeers).toBe(0)
    expect(result.clusterPeers).toBe(1)
  })
})
