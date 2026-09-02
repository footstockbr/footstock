/**
 * @jest-environment node
 */
// ============================================================================
// MarketEngine.syncAssetRoster — reconciliacao do roster de ativos.
//
// Causa raiz coberta aqui: `loadAssets()` so rodava no boot do lider. Um ativo
// ativado (ou reativado) DEPOIS do boot nunca entrava em `assetStates`; como
// `runTick()` monta `currentPrices` iterando `assetStates`, o ticker desse ativo
// nunca aparecia no mapa e o OrderExecutor classificava toda ordem dele como skip
// — para sempre, ate o cron de expiry. O caminho simetrico (ativo desativado que
// continuava tickando e casando ordem) era a outra metade do mesmo defeito.
//
// Os testes exercitam o metodo real do engine com Prisma/Redis dublados; nada do
// pipeline de preco e mockado.
// ============================================================================
import type Redis from 'ioredis'

type AssetRow = {
  id: string
  ticker: string
  cluster: string
  currentPrice: number
  closePrice: number
  fairValue: number
  isHalted: boolean
  haltReason: string | null
  haltedUntil: Date | null
  sentiment: string
  isActive: boolean
}

const mockPrisma = {
  asset: {
    findMany: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
}

jest.mock('@prisma/client', () => ({
  ...jest.requireActual('@prisma/client'),
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}))

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}))

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

import { MarketEngine } from '../MarketEngine'
import { agentOrchestrator } from '../../agents/AgentOrchestrator'

/** Tickers com fair value canonico e preco sao — nao dispara auto-recovery. */
function row(id: string, ticker: string, price: number, over: Partial<AssetRow> = {}): AssetRow {
  return {
    id,
    ticker,
    cluster: 'A_TOP',
    currentPrice: price,
    closePrice: price,
    fairValue: price,
    isHalted: false,
    haltReason: null,
    haltedUntil: null,
    sentiment: 'NEUTRAL',
    isActive: true,
    ...over,
  }
}

const URU3 = row('a-uru', 'URU3', 40.0)
const POR3 = row('a-por', 'POR3', 36.76)
const TIM3 = row('a-tim', 'TIM3', 33.6)

/**
 * Prisma dublado: `findMany` responde ao SHAPE do argumento, como o real faria.
 *   { where: { isActive: true }, select: { id: true } } -> censo de ids
 *   { where: { isActive: true } }                       -> carga do boot
 *   { where: { id: { in: [...] } } }                    -> leitura do lote novo
 */
function wirePrisma(roster: AssetRow[]): void {
  mockPrisma.asset.findMany.mockImplementation(async (args: Record<string, any>) => {
    const ids: string[] | undefined = args?.where?.id?.in
    if (ids) return roster.filter(a => ids.includes(a.id))
    const actives = roster.filter(a => a.isActive)
    if (args?.select?.id) return actives.map(a => ({ id: a.id }))
    return actives
  })
}

function fakeRedis(get: (key: string) => string | null = () => null): Redis {
  return {
    get: jest.fn(async (key: string) => get(key)),
    set: jest.fn(async () => 'OK'),
    incr: jest.fn(async () => 1),
    publish: jest.fn(async () => 0),
  } as unknown as Redis
}

/** Espelha exatamente o que runTick() faz para montar currentPrices. */
function currentPricesOf(engine: MarketEngine): Record<string, number> {
  const states = (engine as unknown as { assetStates: Map<string, { ticker: string; currentPrice: number }> }).assetStates
  const prices: Record<string, number> = {}
  for (const [, state] of states) prices[state.ticker] = state.currentPrice
  return prices
}

async function bootedEngine(roster: AssetRow[], redis: Redis = fakeRedis()): Promise<MarketEngine> {
  wirePrisma(roster)
  const engine = new MarketEngine(redis)
  await (engine as unknown as { loadAssets: () => Promise<void> }).loadAssets()
  return engine
}

describe('syncAssetRoster — ativo que entra depois do boot', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    agentOrchestrator.dispose()
  })

  test('ativo ativado apos o boot passa a ter preco no tick (regressao da causa raiz)', async () => {
    const roster = [URU3, POR3, { ...TIM3, isActive: false }]
    const engine = await bootedEngine(roster)

    // Estado do bug: TIM3 nao existe no roster, logo nao existe em currentPrices e
    // toda ordem de TIM3 e skip-para-sempre.
    expect(currentPricesOf(engine)['TIM3']).toBeUndefined()

    // Operador ativa o ativo no banco — sem restart do motor.
    roster[2] = { ...TIM3, isActive: true }

    const { added, removed } = await engine.syncAssetRoster()

    expect(added).toEqual(['a-tim'])
    expect(removed).toEqual([])
    expect(currentPricesOf(engine)['TIM3']).toBe(33.6)
  })

  test('ativo novo ganha book e agentes proprios', async () => {
    const roster = [URU3, { ...TIM3, isActive: false }]
    const engine = await bootedEngine(roster)
    roster[1] = { ...TIM3, isActive: true }

    await engine.syncAssetRoster()

    const books = (engine as unknown as { orderBooks: Map<string, unknown> }).orderBooks
    expect(books.has('a-tim')).toBe(true)
    // O orchestrator so responde tick para ativo inicializado; sem initAsset o
    // impacto do agente ficaria zerado para sempre nesse ativo.
    expect(agentOrchestrator.hasAsset('a-tim')).toBe(true)
  })

  test('reconciliacao NAO re-hidrata do Redis os estados que ja estavam vivos', async () => {
    // Redis guarda o snapshot do ultimo restart. Se a reconciliacao re-hidratasse o
    // roster inteiro, a variance viva em memoria seria sobrescrita pelo snapshot —
    // um restart parcial silencioso a cada ativo novo.
    const redis = fakeRedis(key => (key.startsWith('garch:var:') ? '0.5' : null))
    const roster = [URU3, { ...TIM3, isActive: false }]
    const engine = await bootedEngine(roster, redis)

    const states = (engine as unknown as { assetStates: Map<string, { variance: number }> }).assetStates
    states.get('a-uru')!.variance = 0.123  // valor "vivo", produzido por ticks

    roster[1] = { ...TIM3, isActive: true }
    await engine.syncAssetRoster()

    expect(states.get('a-uru')!.variance).toBe(0.123)   // intocado
    expect(states.get('a-tim')!.variance).toBe(0.5)     // hidratado, por ser novo
  })
})

describe('syncAssetRoster — ativo que sai do roster', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    agentOrchestrator.dispose()
  })

  test('ativo desativado para de tickar e libera estado, book e agentes', async () => {
    const roster = [URU3, POR3]
    const engine = await bootedEngine(roster)
    expect(currentPricesOf(engine)['POR3']).toBe(36.76)

    roster[1] = { ...POR3, isActive: false }
    const { added, removed } = await engine.syncAssetRoster()

    expect(added).toEqual([])
    expect(removed).toEqual(['a-por'])
    expect(currentPricesOf(engine)['POR3']).toBeUndefined()

    const books = (engine as unknown as { orderBooks: Map<string, unknown> }).orderBooks
    expect(books.has('a-por')).toBe(false)
    expect(agentOrchestrator.hasAsset('a-por')).toBe(false)
    // URU3 segue intacto — a remocao e cirurgica.
    expect(currentPricesOf(engine)['URU3']).toBe(40.0)
  })

  test('remocao cancela o timer de retomada do circuit breaker', async () => {
    const engine = await bootedEngine([URU3])
    const timers = (engine as unknown as { circuitBreakerTimers: Map<string, NodeJS.Timeout> }).circuitBreakerTimers
    const state = (engine as unknown as { assetStates: Map<string, any> }).assetStates.get('a-uru')

    ;(engine as unknown as { scheduleCircuitBreakerResume: (id: string, s: unknown, ms: number) => void })
      .scheduleCircuitBreakerResume('a-uru', state, 60_000)
    expect(timers.has('a-uru')).toBe(true)

    wirePrisma([{ ...URU3, isActive: false }])
    await engine.syncAssetRoster()

    // Timer vivo apontando para um estado descartado seguraria o processo no
    // shutdown e retomaria um ativo que nao existe mais no roster.
    expect(timers.has('a-uru')).toBe(false)
  })

  test('reativar um ativo removido reconstroi o estado do zero', async () => {
    const roster = [URU3, POR3]
    const engine = await bootedEngine(roster)

    roster[1] = { ...POR3, isActive: false }
    await engine.syncAssetRoster()
    expect(currentPricesOf(engine)['POR3']).toBeUndefined()

    // Volta com preco diferente: o estado tem que vir do banco, nao de residuo.
    roster[1] = { ...POR3, isActive: true, currentPrice: 41.5, closePrice: 41.5, fairValue: 41.5 }
    await engine.syncAssetRoster()

    expect(currentPricesOf(engine)['POR3']).toBe(41.5)
  })
})

describe('runTick — fiacao da reconciliacao', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    agentOrchestrator.dispose()
  })

  // Sem esta fiacao o metodo acima existe e passa nos testes, mas NADA o chama em
  // producao e a causa raiz continua de pe. O tick completo nao roda com Prisma
  // dublado (colide no primeiro model que este teste nao dubla), e tudo bem: o que
  // importa provar e que a reconciliacao acontece ANTES disso, no topo do ciclo.
  test('o tick reconcilia o roster antes de processar o ciclo', async () => {
    const roster = [URU3, { ...TIM3, isActive: false }]
    const engine = await bootedEngine(roster)
    roster[1] = { ...TIM3, isActive: true }

    // Zera a janela de cadencia: o proximo tick esta elegivel a reconciliar.
    ;(engine as unknown as { lastRosterSyncMs: number }).lastRosterSyncMs = 0
    await (engine as unknown as { runTick: () => Promise<void> }).runTick().catch(() => undefined)

    expect(currentPricesOf(engine)['TIM3']).toBe(33.6)
  })

  test('dentro da janela de cadencia o tick NAO consulta o banco por roster', async () => {
    const roster = [URU3, { ...TIM3, isActive: false }]
    const engine = await bootedEngine(roster)
    roster[1] = { ...TIM3, isActive: true }

    // lastRosterSyncMs acabou de ser setado pelo boot: a janela ainda nao venceu.
    mockPrisma.asset.findMany.mockClear()
    await (engine as unknown as { runTick: () => Promise<void> }).runTick().catch(() => undefined)

    expect(mockPrisma.asset.findMany).not.toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true },
    })
    expect(currentPricesOf(engine)['TIM3']).toBeUndefined()
  })
})

describe('syncAssetRoster — regime estavel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    agentOrchestrator.dispose()
  })

  test('sem delta: uma unica query, so de ids, e nenhuma mutacao de estado', async () => {
    const engine = await bootedEngine([URU3, POR3])
    const before = currentPricesOf(engine)
    mockPrisma.asset.findMany.mockClear()

    const { added, removed } = await engine.syncAssetRoster()

    expect(added).toEqual([])
    expect(removed).toEqual([])
    expect(mockPrisma.asset.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.asset.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true },
    })
    expect(currentPricesOf(engine)).toEqual(before)
  })
})
