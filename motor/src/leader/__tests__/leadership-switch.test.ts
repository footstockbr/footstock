// ============================================================================
// Testes — troca de lider entre duas instancias no mesmo Redis (T-07)
//
// Criterio de aceite T-07: "Teste com duas instancias apontando para o mesmo
// Redis, forcando troca de lider". Usa a LeaderElection REAL sobre ioredis-mock
// compartilhado — nao ha mock do mecanismo sob teste.
// Rastreabilidade: T-07, M10
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { LeaderElection } from '../LeaderElection'

const LEADER_KEY = 'motor:leader'

describe('LeaderElection — duas instancias no mesmo Redis (T-07)', () => {
  let redis: Redis
  let motorA: LeaderElection
  let motorB: LeaderElection

  beforeEach(() => {
    jest.useFakeTimers()
    // Um unico Redis compartilhado = dois processos apontando para a mesma instancia
    redis = new RedisMock() as unknown as Redis
    motorA = new LeaderElection(redis, 'motor-a')
    motorB = new LeaderElection(redis, 'motor-b')
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await motorA.release().catch(() => undefined)
    await motorB.release().catch(() => undefined)
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  test('[SUCCESS — T-07] exclusao mutua: apenas uma instancia adquire a lideranca', async () => {
    expect(await motorA.tryAcquire()).toBe(true)
    expect(await motorB.tryAcquire()).toBe(false)
    expect(motorA.isLeader).toBe(true)
    expect(motorB.isLeader).toBe(false)
    expect(await redis.get(LEADER_KEY)).toBe('motor-a')
  })

  test('[SUCCESS — T-07] troca de lider: A perde a lease, dispara onLeadershipLost e B assume', async () => {
    // Registra qual instancia parou seu pipeline (o callback e o mesmo hook que
    // index.ts usa para chamar disposeNewsPipeline).
    const pipelinesParados: string[] = []
    motorA.onLeadershipLost = () => { pipelinesParados.push('motor-a') }
    motorB.onLeadershipLost = () => { pipelinesParados.push('motor-b') }

    expect(await motorA.tryAcquire()).toBe(true)
    expect(await motorB.tryAcquire()).toBe(false)

    // Forca a troca: a lease de A some do Redis (GC pause, particao de rede ou
    // TTL expirado sem heartbeat). Equivale a "instancia A congelou".
    await redis.del(LEADER_KEY)

    // Um unico ciclo de heartbeat (10s) basta para A detectar a perda.
    await jest.advanceTimersByTimeAsync(10_000)

    expect(pipelinesParados).toEqual(['motor-a'])
    expect(motorA.isLeader).toBe(false)

    // B assume no proximo poll.
    expect(await motorB.tryAcquire()).toBe(true)
    expect(await redis.get(LEADER_KEY)).toBe('motor-b')

    // Split-brain fechado: A nao readquire enquanto B for lider e em nenhum
    // momento as duas instancias se consideram lider simultaneamente.
    expect(await motorA.tryAcquire()).toBe(false)
    expect(motorA.isLeader).toBe(false)
    expect(motorB.isLeader).toBe(true)
    expect(pipelinesParados).toEqual(['motor-a'])
  })

  test('[SUCCESS — T-07] fencing token avanca por aquisicao real, nao por tentativa', async () => {
    await motorA.tryAcquire()
    const tokenA = (await motorA.getState()).fencingToken

    // Duas tentativas frustradas de B nao podem inflar o token.
    expect(await motorB.tryAcquire()).toBe(false)
    expect(await motorB.tryAcquire()).toBe(false)

    await redis.del(LEADER_KEY)
    expect(await motorB.tryAcquire()).toBe(true)

    const tokenB = (await motorB.getState()).fencingToken
    expect(tokenB).toBe(tokenA + 1)
  })
})
