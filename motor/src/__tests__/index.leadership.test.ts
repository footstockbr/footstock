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

jest.mock('../engine/MarketEngine', () => ({
  MarketEngine: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    getLayersDebug: jest.fn().mockResolvedValue({}),
    getOfiHistory: jest.fn().mockResolvedValue([]),
  })),
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
    mockLeader.tryAcquire.mockResolvedValue(true)
    jest.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as (code?: number | string | null) => never)
  })

  afterEach(() => {
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

  test('onLeadershipLost para o pipeline RSS (fetcher + classifier)', async () => {
    await import('../index')
    await new Promise(r => setTimeout(r, 50))
    expect(capturedOnLeadershipLost).toBeDefined()
    capturedOnLeadershipLost!()
    const { stopNewsPipeline } = await import('../news/NewsPipelineLifecycle')
    expect(stopNewsPipeline).toHaveBeenCalled()
  })
})
