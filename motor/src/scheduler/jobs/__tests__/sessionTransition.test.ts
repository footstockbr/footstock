// ============================================================================
// FootStock Motor — trilha de auditoria de transicao de sessao (09-02).
//
// Ate 09-02 este arquivo testava um STUB: afirmava que o job logava
// "Iniciando..." e "concluido (stub)". A suite passava verde havia meses sobre
// um job que nao escrevia nada, enquanto o unico escritor real era uma rota Next
// que nada agendava e a tabela nem existia em producao.
//
// Agora a suite exercita a logica de verdade (services/cron/session-transition),
// com prisma e redis injetados.
// ============================================================================

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import {
  runSessionTransition,
  __resetSessionTransitionCache,
  PREVIOUS_SESSION_KEY,
} from '../../../services/cron/session-transition'
import type { SessionType } from '../../../types/motor.types'

function makeDeps(opts: {
  redisPrevious?: string | null
  session: SessionType
  now?: Date
  createManyImpl?: jest.Mock
  redisGetImpl?: jest.Mock
  redisSetImpl?: jest.Mock
}) {
  const createMany = opts.createManyImpl ?? jest.fn(async () => ({ count: 1 }))
  const get = opts.redisGetImpl ?? jest.fn(async () => opts.redisPrevious ?? null)
  const set = opts.redisSetImpl ?? jest.fn(async () => 'OK')
  return {
    deps: {
      prisma: { marketSessionLog: { createMany } } as never,
      redis: { get, set } as never,
      getSession: () => opts.session,
      now: () => opts.now ?? new Date('2026-09-02T13:00:00.000Z'),
    },
    createMany,
    get,
    set,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  __resetSessionTransitionCache()
})

describe('runSessionTransition — registro da transicao', () => {
  it('grava a linha quando a sessao muda, com o dia BRT como chave natural', async () => {
    const { deps, createMany } = makeDeps({
      redisPrevious: 'PRE_OPENING',
      session: 'TRADING',
      now: new Date('2026-09-02T13:00:00.000Z'), // 10:00 BRT
    })

    const result = await runSessionTransition(deps)

    expect(result).toMatchObject({ session: 'TRADING', transitioned: true, logged: true })
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          fromSession: 'PRE_OPENING',
          toSession: 'TRADING',
          transitionAt: new Date('2026-09-02T13:00:00.000Z'),
          transitionDay: '2026-09-02',
        },
      ],
      skipDuplicates: true,
    })
  })

  it('sessao inalterada nao grava nada', async () => {
    const { deps, createMany } = makeDeps({ redisPrevious: 'TRADING', session: 'TRADING' })

    const result = await runSessionTransition(deps)

    expect(result).toMatchObject({ transitioned: false, logged: false })
    expect(createMany).not.toHaveBeenCalled()
  })

  it('primeiro ciclo com Redis vazio so semeia o cursor (nao inventa transicao)', async () => {
    const { deps, createMany, set } = makeDeps({ redisPrevious: null, session: 'TRADING' })

    const result = await runSessionTransition(deps)

    expect(result).toMatchObject({ previous: null, transitioned: false, logged: false })
    expect(createMany).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith(PREVIOUS_SESSION_KEY, 'TRADING', 'EX', 86_400)
  })

  it('linha ja existente (chave natural) reporta logged=false, sem erro', async () => {
    const { deps } = makeDeps({
      redisPrevious: 'TRADING',
      session: 'CLOSING_CALL',
      createManyImpl: jest.fn(async () => ({ count: 0 })), // skipDuplicates absorveu
    })

    const result = await runSessionTransition(deps)

    expect(result).toMatchObject({ transitioned: true, logged: false })
  })

  it('a virada de dia BRT vai para o transition_day certo (nao o dia UTC)', async () => {
    // 02:30Z do dia 03 ainda e 23:30 BRT do dia 02.
    const { deps, createMany } = makeDeps({
      redisPrevious: 'AFTER_MARKET',
      session: 'CLOSED',
      now: new Date('2026-09-03T02:30:00.000Z'),
    })

    await runSessionTransition(deps)

    expect(createMany.mock.calls[0][0].data[0].transitionDay).toBe('2026-09-02')
  })
})

describe('runSessionTransition — durabilidade do cursor', () => {
  it('so consulta o Redis uma vez por processo (espelho em memoria)', async () => {
    const { deps, get } = makeDeps({ redisPrevious: 'TRADING', session: 'TRADING' })

    await runSessionTransition(deps)
    await runSessionTransition(deps)

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('falha do banco NAO avanca o cursor — a transicao e tentada de novo', async () => {
    const boom = jest.fn(async () => {
      throw new Error('conexao caiu')
    })
    const { deps, set } = makeDeps({
      redisPrevious: 'PRE_OPENING',
      session: 'TRADING',
      createManyImpl: boom,
    })

    const first = await runSessionTransition(deps)
    expect(first).toMatchObject({ transitioned: true, logged: false })
    expect(set).not.toHaveBeenCalled() // cursor parado em PRE_OPENING

    // Proximo ciclo: o banco volta, a mesma transicao e gravada.
    const retry = makeDeps({ redisPrevious: 'PRE_OPENING', session: 'TRADING' })
    const second = await runSessionTransition(retry.deps)
    expect(second).toMatchObject({ previous: 'PRE_OPENING', transitioned: true, logged: true })
  })

  it('Redis indisponivel na leitura nao derruba o job', async () => {
    const { deps, createMany } = makeDeps({
      session: 'TRADING',
      redisGetImpl: jest.fn(async () => {
        throw new Error('redis fora')
      }),
    })

    await expect(runSessionTransition(deps)).resolves.toMatchObject({ session: 'TRADING' })
    expect(createMany).not.toHaveBeenCalled()
  })

  it('Redis indisponivel na escrita nao derruba o job nem desfaz a linha gravada', async () => {
    const { deps } = makeDeps({
      redisPrevious: 'PRE_OPENING',
      session: 'TRADING',
      redisSetImpl: jest.fn(async () => {
        throw new Error('redis fora')
      }),
    })

    await expect(runSessionTransition(deps)).resolves.toMatchObject({ logged: true })
  })
})
