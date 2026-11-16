// ============================================================================
// Testes — index.ts leadership lifecycle (T-07)
// Rastreabilidade: T-07
// ============================================================================

const mockRssFetcher = {
  start: jest.fn(),
  stop: jest.fn(),
  fetchAll: jest.fn().mockResolvedValue(0),
}

const mockNewsClassifier = {
  startClassifying: jest.fn().mockResolvedValue(undefined),
  stopClassifying: jest.fn(),
}

const mockPipeline = {
  rssFetcher: mockRssFetcher,
  newsClassifier: mockNewsClassifier,
  newsPrisma: { $disconnect: jest.fn().mockResolvedValue(undefined) },
}

let capturedOnLeadershipLost: (() => void) | undefined

const mockLeader = {
  tryAcquire: jest.fn().mockResolvedValue(true),
  release: jest.fn().mockResolvedValue(undefined),
  onLeadershipLost: undefined as (() => void) | undefined,
}

Object.defineProperty(mockLeader, 'onLeadershipLost', {
  set(fn: (() => void) | undefined) {
    capturedOnLeadershipLost = fn
  },
  get() {
    return capturedOnLeadershipLost
  },
})

jest.mock('../leader/LeaderElection', () => ({
  LeaderElection: jest.fn().mockImplementation(() => mockLeader),
}))

jest.mock('../news/NewsPipelineLifecycle', () => ({
  startNewsPipeline: jest.fn().mockResolvedValue(mockPipeline),
  stopNewsPipeline: jest.fn(),
  disposeNewsPipeline: jest.fn().mockResolvedValue(undefined),
}))

const mockRedis = {
  quit: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
}

jest.mock('../services/RedisClientService', () => ({
  RedisClientService: {
    getInstance: jest.fn().mockResolvedValue(mockRedis),
    createSubscriber: jest.fn().mockReturnValue({ quit: jest.fn().mockResolvedValue(undefined) }),
  },
}))

const mockEngine = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  getLayersDebug: jest.fn().mockResolvedValue({}),
  getOfiHistory: jest.fn().mockResolvedValue([]),
}

jest.mock('../engine/MarketEngine', () => ({
  MarketEngine: jest.fn().mockImplementation(() => mockEngine),
}))

jest.mock('../services/MotorHealthService', () => ({
  MotorHealthService: {
    getInstance: jest.fn().mockReturnValue({
      publishOffline: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))

jest.mock('../broadcast/AdminChannel', () => ({
  AdminChannel: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
}))

jest.mock('../scheduler', () => ({
  registerAllJobs: jest.fn(),
  startScheduler: jest.fn(),
}))

jest.mock('../server/routes/marketStream', () => ({
  handleMarketStream: jest.fn(),
}))

jest.mock('../server/routes/newsStream', () => ({
  handleNewsStream: jest.fn(),
}))

jest.mock('../lib/auth', () => ({
  verifyJwt: jest.fn(),
  extractTokenFromRequest: jest.fn(),
}))

const loggerCalls: { level: string; args: unknown[] }[] = []
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn((...args: unknown[]) => loggerCalls.push({ level: 'info', args })),
    warn: jest.fn((...args: unknown[]) => loggerCalls.push({ level: 'warn', args })),
    error: jest.fn((...args: unknown[]) => loggerCalls.push({ level: 'error', args })),
  },
}))

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}))

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({
    queryRaw: jest.fn(),
    executeRaw: jest.fn(),
  })),
}))

jest.mock('http', () => ({
  ...jest.requireActual('http'),
  createServer: jest.fn().mockReturnValue({
    listen: jest.fn(),
  }),
}))

// Impede que main() inicie o scheduler
process.env.MOTOR_SCHEDULER_ENABLED = 'false'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const originalExit = process.exit
describe('index — leadership lifecycle (T-07)', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    capturedOnLeadershipLost = undefined
    loggerCalls.length = 0
    mockLeader.tryAcquire.mockReset()
    mockLeader.tryAcquire.mockResolvedValue(true)
    mockLeader.release.mockReset()
    mockLeader.release.mockResolvedValue(undefined)
    mockEngine.start.mockReset()
    mockEngine.start.mockResolvedValue(undefined)
    jest.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as (code?: number | string | null) => never)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  test('registra handler global de unhandledRejection', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as (code?: number | string | null) => never)
    const onSpy = jest.spyOn(process, 'on').mockImplementation(() => process)
    await import('../index')
    await new Promise(r => setTimeout(r, 100))
    expect(exitSpy).not.toHaveBeenCalled()
    expect(onSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function))
    onSpy.mockRestore()
    exitSpy.mockRestore()
  })

  test('onLeadershipLost descarta o pipeline RSS (fetcher + classifier + Prisma)', async () => {
    await import('../index')
    await new Promise(r => setTimeout(r, 50))
    expect(capturedOnLeadershipLost).toBeDefined()
    capturedOnLeadershipLost!()
    const { disposeNewsPipeline } = await import('../news/NewsPipelineLifecycle')
    // dispose (nao stop) — a referencia ao pipeline e descartada logo em seguida,
    // entao o PrismaClient precisa ser fechado junto para nao vazar o pool PG.
    expect(disposeNewsPipeline).toHaveBeenCalledWith(mockPipeline)
  })

  test('erro injetado no poll de lideranca: loga, nao encerra o processo e reagenda', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] })
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as (code?: number | string | null) => never)

    mockLeader.tryAcquire
      .mockResolvedValueOnce(false)                          // startup: nao e lider -> startPolling
      .mockRejectedValueOnce(new Error('redis blip no poll')) // 1o poll: erro injetado
      .mockResolvedValue(false)                              // polls seguintes

    await import('../index')
    await jest.advanceTimersByTimeAsync(0)
    expect(mockLeader.tryAcquire).toHaveBeenCalledTimes(1)

    // Primeiro poll acontece em baseDelay (5s) — nao em 10s.
    await jest.advanceTimersByTimeAsync(5_000)
    expect(mockLeader.tryAcquire).toHaveBeenCalledTimes(2)

    const erroLogado = loggerCalls.find(
      c => c.level === 'error' && String(c.args[0]).includes('Erro no polling de lideranca')
    )
    expect(erroLogado).toBeDefined()
    // Nunca sair em silencio por causa de um erro no poll.
    expect(exitSpy).not.toHaveBeenCalled()

    // Apos o erro o ciclo continua: o primeiro retry tambem usa baseDelay (5s).
    await jest.advanceTimersByTimeAsync(5_000)
    expect(mockLeader.tryAcquire).toHaveBeenCalledTimes(3)
    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
  })

  test('startPolling nao acumula timers concorrentes entre flaps de lideranca', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] })
    mockLeader.tryAcquire.mockResolvedValue(true)

    await import('../index')
    await jest.advanceTimersByTimeAsync(0)
    expect(capturedOnLeadershipLost).toBeDefined()

    // Startup adquiriu a lideranca (1 chamada). Dois flaps seguidos disparam
    // startPolling duas vezes; o timer da rodada anterior deve ser cancelado.
    mockLeader.tryAcquire.mockResolvedValue(false)
    capturedOnLeadershipLost!()
    capturedOnLeadershipLost!()

    await jest.advanceTimersByTimeAsync(5_000)
    // 1 do startup + 1 unico poll (nao 2) = 2. Com timers acumulados seriam 3.
    expect(mockLeader.tryAcquire).toHaveBeenCalledTimes(2)
  })

  // Incidente 2026-11-10: lideranca perdida com o banco fora, re-adquirida 5s depois,
  // engine.start() falhou no preflight (ATTRIBUTION_STRICT_MODE) e o motor ficou 6 dias
  // segurando a lease sem tickar: o catch do poll so reagendava, e tryAcquire (SET NX)
  // devolvia false porque a chave continuava dele.
  test('start falha depois de adquirir no poll: libera a lease, re-tenta com backoff e sobe quando o banco volta', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] })
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as (code?: number | string | null) => never)

    mockLeader.tryAcquire
      .mockResolvedValueOnce(false) // startup: outro lider
      .mockResolvedValue(true)      // polls: lease livre
    mockEngine.start
      .mockRejectedValueOnce(new Error('[engine] ATTRIBUTION_STRICT_MODE bloqueado: banco fora'))
      .mockResolvedValue(undefined)

    await import('../index')
    await jest.advanceTimersByTimeAsync(0)

    // 1o poll (5s): adquire, start falha -> devolve a lease em vez de segura-la.
    await jest.advanceTimersByTimeAsync(5_000)
    expect(mockEngine.start).toHaveBeenCalledTimes(1)
    expect(mockLeader.release).toHaveBeenCalledTimes(1)
    expect(mockEngine.stop).toHaveBeenCalledWith(false)
    expect(loggerCalls.some(
      c => c.level === 'error' && String(c.args[0]).includes('Falha ao iniciar como lider (falhas_consecutivas=1)')
    )).toBe(true)

    // Re-tentativa com backoff (10s apos 1 falha), nao 5s.
    await jest.advanceTimersByTimeAsync(5_000)
    expect(mockLeader.tryAcquire).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(5_000)
    expect(mockLeader.tryAcquire).toHaveBeenCalledTimes(3)

    // Banco de volta: engine sobe, lease mantida, onLeadershipLost instalado.
    expect(mockEngine.start).toHaveBeenCalledTimes(2)
    expect(mockLeader.release).toHaveBeenCalledTimes(1)
    expect(capturedOnLeadershipLost).toBeDefined()

    // Lider de fato: polling encerrado.
    await jest.advanceTimersByTimeAsync(120_000)
    expect(mockLeader.tryAcquire).toHaveBeenCalledTimes(3)
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test('start falha no boot (ja lider): libera a lease e cai no polling em vez de derrubar o processo', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] })
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as (code?: number | string | null) => never)

    mockLeader.tryAcquire.mockResolvedValue(true)
    mockEngine.start
      .mockRejectedValueOnce(new Error('db fora'))
      .mockRejectedValueOnce(new Error('db fora'))
      .mockResolvedValue(undefined)

    await import('../index')
    await jest.advanceTimersByTimeAsync(0)
    expect(mockLeader.release).toHaveBeenCalledTimes(1)
    expect(exitSpy).not.toHaveBeenCalled()

    // 2a falha: backoff de 10s; depois 20s ate a proxima tentativa.
    await jest.advanceTimersByTimeAsync(10_000)
    expect(mockEngine.start).toHaveBeenCalledTimes(2)
    expect(mockLeader.release).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(19_999)
    expect(mockEngine.start).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(1)
    expect(mockEngine.start).toHaveBeenCalledTimes(3)
    expect(mockLeader.release).toHaveBeenCalledTimes(2)
    expect(exitSpy).not.toHaveBeenCalled()
  })
})
