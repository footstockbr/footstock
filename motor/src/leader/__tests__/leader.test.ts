import { LeaderElection } from '../LeaderElection'

// Mock do Redis
const mockRedis = {
  pipeline: jest.fn(),
  // D6 (06-18): tryAcquire agora usa set NX + incr condicional (nao mais pipeline).
  set: jest.fn(),
  incr: jest.fn(),
  eval: jest.fn(),
  get: jest.fn(),
  pttl: jest.fn(),
  quit: jest.fn(),
}

const mockPipeline = {
  set: jest.fn().mockReturnThis(),
  incr: jest.fn().mockReturnThis(),
  exec: jest.fn(),
}

describe('LeaderElection', () => {
  let leader: LeaderElection

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockRedis.pipeline.mockReturnValue(mockPipeline)
    leader = new LeaderElection(mockRedis as any, 'motor-test-001')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('tryAcquire retorna true quando Redis retorna OK', async () => {
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.incr.mockResolvedValue(42)

    const result = await leader.tryAcquire()
    expect(result).toBe(true)
    expect(leader.isLeader).toBe(true)
    // D6: incr SO no acquire (nao em toda tentativa).
    expect(mockRedis.incr).toHaveBeenCalledTimes(1)
  })

  test('tryAcquire retorna false quando outro motor é líder', async () => {
    mockRedis.set.mockResolvedValue(null)  // SET NX retorna null quando a chave existe

    const result = await leader.tryAcquire()
    expect(result).toBe(false)
    expect(leader.isLeader).toBe(false)
    // D6: nao incrementa o fencing token quando a aquisicao falha.
    expect(mockRedis.incr).not.toHaveBeenCalled()
  })

  test('tryAcquire retorna false se SET NX falha (null)', async () => {
    mockRedis.set.mockResolvedValue(null)
    const result = await leader.tryAcquire()
    expect(result).toBe(false)
  })

  test('release libera liderança com Lua script', async () => {
    // Primeiro adquire
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.incr.mockResolvedValue(1)
    await leader.tryAcquire()

    // Depois libera
    mockRedis.eval.mockResolvedValue(1)
    await leader.release()

    expect(leader.isLeader).toBe(false)
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('DEL'),
      1,
      'motor:leader',
      'motor-test-001'
    )
  })

  test('release não faz nada se não é líder', async () => {
    await leader.release()
    expect(mockRedis.eval).not.toHaveBeenCalled()
  })

  test('isCurrentLeader verifica estado no Redis', async () => {
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.incr.mockResolvedValue(1)
    await leader.tryAcquire()

    mockRedis.get.mockResolvedValue('motor-test-001')
    const isLeader = await leader.isCurrentLeader()
    expect(isLeader).toBe(true)
  })

  test('isCurrentLeader retorna false se outro motor assumiu', async () => {
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.incr.mockResolvedValue(1)
    await leader.tryAcquire()

    mockRedis.get.mockResolvedValue('motor-outro-999')
    const isLeader = await leader.isCurrentLeader()
    expect(isLeader).toBe(false)
    expect(leader.isLeader).toBe(false)
  })

  test('getState retorna estado completo', async () => {
    mockRedis.get.mockResolvedValue('motor-outro')
    mockRedis.pttl.mockResolvedValue(25000)

    const state = await leader.getState()
    expect(state.leaderId).toBe('motor-outro')
    expect(state.ttl).toBe(25000)
    expect(state.isLeader).toBe(false)
  })

  // Testes de segurança (ST003)
  test('construtor lança erro para motorId com caracteres especiais', () => {
    expect(() => new LeaderElection(mockRedis as any, 'motor; DROP TABLE users')).toThrow()
    expect(() => new LeaderElection(mockRedis as any, 'motor-ok-001')).not.toThrow()
  })

  test('construtor lança erro para motorId acima de 128 chars', () => {
    const longId = 'a'.repeat(129)
    expect(() => new LeaderElection(mockRedis as any, longId)).toThrow()
  })
})
