/**
 * @jest-environment node
 */
// ============================================================================
// Ciclo de vida da retentativa (Fase 3, 2026-09-02)
//
// O defeito que esta fase matou: ordem que falhava na liquidacao nao deixava
// rastro na linha, entao voltava ao lote a cada tick para sempre. Com `take`
// fixo + `orderBy createdAt asc`, uma unica ordem cronicamente ruim ficava na
// cabeca da fila e comia slot do lote em TODOS os ticks.
//
// O que estes testes travam, em ordem de gravidade:
//   1. cancelamento so acontece com contador PERSISTIDO (falha de escrita nao
//      pode cancelar ordem sa);
//   2. CAS por status em toda escrita terminal (fill/cancelamento concorrente
//      vence);
//   3. perna OCO irma so recebe aviso se foi de fato cancelada (o job de
//      expiracao ja pagou por avisar perna FILLED);
//   4. classificacao por CODIGO, nunca por substring de mensagem.
//
// Desenho: docs/FASE3-ciclo-de-vida-da-ordem.md
// ============================================================================

import { Prisma } from '@prisma/client'
import {
  MAX_ATTEMPTS,
  SHORT_BACKOFF_MS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  errorCodeOf,
  isTransient,
  backoffMs,
  eligibleNowFilter,
  RETRY_ORDER_BY,
  recordFailedAttempt,
  cancelExhaustedOrder,
} from '../orderRetry'

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  motorMetrics: { observe: jest.fn(), increment: jest.fn() },
}))

type AnyRec = Record<string, any>

const NOW = new Date('2026-09-02T15:00:00.000Z')

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: '6.0.0' })
}

// ─── errorCodeOf ────────────────────────────────────────────────────────────

describe('errorCodeOf', () => {
  it('extrai o code do erro conhecido do Prisma', () => {
    expect(errorCodeOf(knownError('P2034'))).toBe('P2034')
  })

  it('extrai SQLSTATE cru do driver', () => {
    expect(errorCodeOf({ code: '40001' })).toBe('40001')
    expect(errorCodeOf({ code: '40P01' })).toBe('40P01')
  })

  it('recusa `code` que nao tem forma de SQLSTATE — evita gravar lixo na coluna', () => {
    expect(errorCodeOf({ code: 'ECONNREFUSED' })).toBe('UNKNOWN')
    expect(errorCodeOf({ code: 42 })).toBe('UNKNOWN')
  })

  it('NUNCA devolve a mensagem do erro', () => {
    const err = new Error('deadlock detected on relation orders')
    expect(errorCodeOf(err)).toBe('UNKNOWN')
  })

  it('tolera null/undefined', () => {
    expect(errorCodeOf(null)).toBe('UNKNOWN')
    expect(errorCodeOf(undefined)).toBe('UNKNOWN')
  })
})

// ─── classificacao e backoff ────────────────────────────────────────────────

describe('isTransient', () => {
  it('classifica contencao como transitoria', () => {
    expect(isTransient('P2034')).toBe(true)
    expect(isTransient('40001')).toBe(true)
    expect(isTransient('40P01')).toBe(true)
  })

  it('trata desconhecido e violacao de constraint como persistente', () => {
    expect(isTransient('UNKNOWN')).toBe(false)
    expect(isTransient('P2002')).toBe(false)
  })
})

describe('backoffMs', () => {
  it('devolve a transitoria ao proximo tick nas duas primeiras ocorrencias', () => {
    expect(backoffMs(1, 'P2034')).toBe(SHORT_BACKOFF_MS)
    expect(backoffMs(2, 'P2034')).toBe(SHORT_BACKOFF_MS)
  })

  it('so entra em exponencial na transitoria a partir da terceira', () => {
    expect(backoffMs(3, 'P2034')).toBe(BASE_BACKOFF_MS)
    expect(backoffMs(4, 'P2034')).toBe(BASE_BACKOFF_MS * 2)
  })

  it('poe a persistente em exponencial ja na primeira', () => {
    expect(backoffMs(1, 'UNKNOWN')).toBe(BASE_BACKOFF_MS)
    expect(backoffMs(2, 'UNKNOWN')).toBe(BASE_BACKOFF_MS * 2)
    expect(backoffMs(3, 'UNKNOWN')).toBe(BASE_BACKOFF_MS * 4)
  })

  it('respeita o teto', () => {
    expect(backoffMs(20, 'UNKNOWN')).toBe(MAX_BACKOFF_MS)
    expect(backoffMs(20, 'P2034')).toBe(MAX_BACKOFF_MS)
  })

  it('cabe em menos de uma hora somando as MAX_ATTEMPTS esperas', () => {
    let total = 0
    for (let a = 1; a <= MAX_ATTEMPTS; a++) total += backoffMs(a, 'UNKNOWN')
    expect(total).toBeLessThan(60 * 60_000)
  })
})

// ─── filtro de elegibilidade ────────────────────────────────────────────────

describe('eligibleNowFilter', () => {
  it('inclui `nextAttemptAt: null` — sem isso a migration tiraria a base inteira da varredura', () => {
    expect(eligibleNowFilter(NOW)).toEqual({
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: NOW } }],
    })
  })

  it('ordena por nextAttemptAt e desempata por createdAt', () => {
    expect(RETRY_ORDER_BY).toEqual([{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }])
  })
})

// ─── recordFailedAttempt ────────────────────────────────────────────────────

function makePrismaForAttempt(over: AnyRec = {}): AnyRec {
  return {
    order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    ...over,
  }
}

describe('recordFailedAttempt', () => {
  it('incrementa o contador e agenda a proxima tentativa na propria linha', async () => {
    const prisma = makePrismaForAttempt()
    const out = await recordFailedAttempt(prisma as any, 'T', { id: 'o-1', attemptCount: 0 }, knownError('P2034'), NOW)

    expect(out).toEqual({
      attemptCount: 1,
      code: 'P2034',
      exhausted: false,
      nextAttemptAt: new Date(NOW.getTime() + SHORT_BACKOFF_MS),
    })
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o-1', status: { in: ['OPEN', 'PARTIAL'] } },
      data: {
        attemptCount: 1,
        lastAttemptAt: NOW,
        lastErrorCode: 'P2034',
        nextAttemptAt: new Date(NOW.getTime() + SHORT_BACKOFF_MS),
      },
    })
  })

  it('marca esgotado na MAX_ATTEMPTS-esima falha e para de reagendar', async () => {
    const prisma = makePrismaForAttempt()
    const out = await recordFailedAttempt(
      prisma as any,
      'T',
      { id: 'o-1', attemptCount: MAX_ATTEMPTS - 1 },
      knownError('P2034'),
      NOW
    )

    expect(out.attemptCount).toBe(MAX_ATTEMPTS)
    expect(out.exhausted).toBe(true)
    expect(out.nextAttemptAt).toBeNull()
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nextAttemptAt: null }) })
    )
  })

  it('nao declara esgotamento quando o CAS perde a corrida (ordem ja terminal)', async () => {
    const prisma = makePrismaForAttempt({ order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } })
    const out = await recordFailedAttempt(
      prisma as any,
      'T',
      { id: 'o-1', attemptCount: MAX_ATTEMPTS - 1 },
      knownError('P2034'),
      NOW
    )
    expect(out.exhausted).toBe(false)
  })

  it('nao declara esgotamento quando a propria escrita do contador falha', async () => {
    const prisma = makePrismaForAttempt({
      order: { updateMany: jest.fn().mockRejectedValue(new Error('db down')) },
    })
    const out = await recordFailedAttempt(
      prisma as any,
      'T',
      { id: 'o-1', attemptCount: MAX_ATTEMPTS - 1 },
      knownError('P2034'),
      NOW
    )
    // Cancelar por contador que nao foi persistido mataria ordem sa.
    expect(out.exhausted).toBe(false)
  })

  it('nunca lanca — registrar backoff nao pode derrubar o lote', async () => {
    const prisma = makePrismaForAttempt({
      order: { updateMany: jest.fn().mockRejectedValue(new Error('db down')) },
    })
    await expect(
      recordFailedAttempt(prisma as any, 'T', { id: 'o-1', attemptCount: 0 }, new Error('x'), NOW)
    ).resolves.toBeDefined()
  })

  it('trata attemptCount ausente (linha historica) como zero', async () => {
    const prisma = makePrismaForAttempt()
    const out = await recordFailedAttempt(prisma as any, 'T', { id: 'o-1' } as any, new Error('x'), NOW)
    expect(out.attemptCount).toBe(1)
  })
})

// ─── cancelExhaustedOrder ───────────────────────────────────────────────────

function makePrismaForCancel(opts: { claimCount?: number; siblings?: AnyRec[]; txThrows?: boolean } = {}): AnyRec {
  const tx: AnyRec = {
    order: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
      findMany: jest.fn().mockResolvedValue(opts.siblings ?? []),
    },
  }
  return {
    _tx: tx,
    $transaction: jest.fn().mockImplementation((fn: (t: AnyRec) => Promise<any>) => {
      if (opts.txThrows) return Promise.reject(new Error('tx down'))
      return fn(tx)
    }),
  }
}

const EXHAUSTED_ORDER = {
  id: 'o-1',
  userId: 'u-1',
  side: 'BUY',
  quantity: 3,
  groupId: null,
  asset: { ticker: 'URU3' },
}

describe('cancelExhaustedOrder', () => {
  it('cancela sob CAS de status e grava o motivo na linha', async () => {
    const prisma = makePrismaForCancel()
    const persist = jest.fn().mockResolvedValue(undefined)

    await cancelExhaustedOrder(prisma as any, 'T', EXHAUSTED_ORDER, persist)

    expect(prisma._tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o-1', status: { in: ['OPEN', 'PARTIAL'] } },
      data: { status: 'CANCELLED', cancelReason: 'EXECUTION_RETRY_EXHAUSTED', nextAttemptAt: null },
    })
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        type: 'ORDER_CANCELLED',
        idempotencyKey: 'motor:order_cancelled:retry_exhausted:o-1',
        data: expect.objectContaining({ motivo: 'EXECUTION_RETRY_EXHAUSTED' }),
      })
    )
  })

  it('nao avisa quando o CAS perde a corrida — a ordem ja liquidou ou o usuario cancelou', async () => {
    const prisma = makePrismaForCancel({ claimCount: 0 })
    const persist = jest.fn()

    await cancelExhaustedOrder(prisma as any, 'T', EXHAUSTED_ORDER, persist)

    expect(persist).not.toHaveBeenCalled()
  })

  it('derruba a perna OCO irma com motivo proprio e aviso proprio', async () => {
    const prisma = makePrismaForCancel({
      siblings: [{ id: 'o-2', userId: 'u-1', side: 'SELL', quantity: 3, asset: { ticker: 'URU3' } }],
    })
    const persist = jest.fn().mockResolvedValue(undefined)

    await cancelExhaustedOrder(prisma as any, 'T', { ...EXHAUSTED_ORDER, groupId: 'grp-1' }, persist)

    // Le a irma DENTRO da transacao e com o MESMO filtro de status do update.
    expect(prisma._tx.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'grp-1', id: { not: 'o-1' }, status: { in: ['OPEN', 'PARTIAL'] } },
      })
    )
    expect(prisma._tx.order.updateMany).toHaveBeenLastCalledWith({
      where: { id: { in: ['o-2'] } },
      data: { status: 'CANCELLED', cancelReason: 'OCO_SIBLING', nextAttemptAt: null },
    })
    expect(persist).toHaveBeenCalledTimes(2)
    const sibling = persist.mock.calls.map((c) => c[0]).find((i: AnyRec) => i.data.orderId === 'o-2')
    expect(sibling.idempotencyKey).toBe('motor:order_cancelled:retry_exhausted:o-2')
    expect(sibling.data.motivo).toBe('OCO_SIBLING')
    expect(sibling.body).toContain('OCO')
  })

  it('nao toca em irma quando a ordem nao tem grupo', async () => {
    const prisma = makePrismaForCancel()
    await cancelExhaustedOrder(prisma as any, 'T', EXHAUSTED_ORDER, jest.fn())
    expect(prisma._tx.order.findMany).not.toHaveBeenCalled()
  })

  it('nao avisa nada se a transacao falhou — aviso sem cancelamento e mentira', async () => {
    const prisma = makePrismaForCancel({ txThrows: true })
    const persist = jest.fn()

    await expect(cancelExhaustedOrder(prisma as any, 'T', EXHAUSTED_ORDER, persist)).resolves.toBeUndefined()
    expect(persist).not.toHaveBeenCalled()
  })
})
