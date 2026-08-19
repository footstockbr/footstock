/**
 * Rate limiter atomicity tests for NewsClassifier.checkRateLimit().
 *
 * Validates the Lua script fix for:
 * - M9: Race condition where the key expires between EXISTS and DECR, causing
 *   DECR to recreate the key at -1 without TTL -> permanent lockout.
 * - M4: Initialization race where multiple instances call SET without NX,
 *   potentially resetting the bucket mid-flight.
 *
 * These tests run the REAL Lua scripts (imported from the module under test)
 * through ioredis-mock's Lua interpreter — no hand-rolled reimplementation of
 * the script semantics. Every assertion reads TTL/value back from Redis with
 * the real `ttl()`/`get()` commands, so a syntax error, a wrong command name
 * or a changed branch inside the Lua fails these tests.
 */

import type { Redis } from 'ioredis'
import RedisMock from 'ioredis-mock'

import {
  NewsClassifier,
  RateLimitError,
  RATE_LIMIT_CHECK_DECR_SCRIPT,
  RATE_LIMIT_REVERT_INCR_SCRIPT,
  RATE_LIMIT_KEY,
  RATE_LIMIT_MAX,
  RATE_LIMIT_TTL,
} from '../NewsClassifier'

describe('NewsClassifier.checkRateLimit — atomic Lua script', () => {
  let redis: Redis
  let classifier: NewsClassifier

  /** Estado real lido do Redis (nao de um mock artesanal). */
  async function readState(): Promise<{ value: number | null; ttl: number }> {
    const raw = await redis.get(RATE_LIMIT_KEY)
    const ttl = await redis.ttl(RATE_LIMIT_KEY)
    return { value: raw === null ? null : Number(raw), ttl }
  }

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis
    // ioredis-mock compartilha keyspace entre instancias: limpar e obrigatorio
    // para que "chave ausente" signifique de fato chave ausente.
    await redis.flushall()
    classifier = new NewsClassifier(redis)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Sanity: os scripts importados sao os de producao e rodam no interpretador
  // -------------------------------------------------------------------------

  describe('script wiring', () => {
    it('imports the production scripts (not a test-local copy)', () => {
      expect(RATE_LIMIT_CHECK_DECR_SCRIPT).toContain("redis.call('SET', key, max, 'EX', ttl, 'NX')")
      expect(RATE_LIMIT_CHECK_DECR_SCRIPT).toContain("redis.call('EXPIRE', key, ttl)")
      expect(RATE_LIMIT_REVERT_INCR_SCRIPT).toContain("redis.call('INCR', key)")
    })

    it('executes the real check-decr Lua directly against Redis', async () => {
      const tokens = (await redis.eval(
        RATE_LIMIT_CHECK_DECR_SCRIPT,
        1,
        RATE_LIMIT_KEY,
        RATE_LIMIT_MAX,
        RATE_LIMIT_TTL,
      )) as number

      expect(tokens).toBe(RATE_LIMIT_MAX - 1)
      const state = await readState()
      expect(state.value).toBe(RATE_LIMIT_MAX - 1)
      expect(state.ttl).toBeGreaterThan(0)
    })

    it('executes the real revert-incr Lua directly against Redis', async () => {
      await redis.set(RATE_LIMIT_KEY, '-1')

      const ret = (await redis.eval(
        RATE_LIMIT_REVERT_INCR_SCRIPT,
        1,
        RATE_LIMIT_KEY,
        RATE_LIMIT_TTL,
      )) as number

      expect(ret).toBe(1)
      const state = await readState()
      expect(state.value).toBe(0)
      expect(state.ttl).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // TTL guarantee — caminho normal
  // -------------------------------------------------------------------------

  describe('TTL guarantee — normal path', () => {
    it('key has TTL > 0 after successful checkRateLimit (fresh key)', async () => {
      await classifier.checkRateLimit()

      const state = await readState()
      expect(state.value).toBe(RATE_LIMIT_MAX - 1)
      expect(state.ttl).toBeGreaterThan(0)
    })

    it('key has TTL > 0 after multiple successful calls', async () => {
      for (let i = 0; i < 5; i++) {
        await classifier.checkRateLimit()
      }

      const state = await readState()
      expect(state.value).toBe(RATE_LIMIT_MAX - 5)
      expect(state.ttl).toBeGreaterThan(0)
    })

    it('key has TTL > 0 even when it had no TTL (orphaned key from previous bug)', async () => {
      // Reproduz a chave orfa deixada pelo bug M9: valor presente, TTL ausente.
      await redis.set(RATE_LIMIT_KEY, '30')
      expect((await readState()).ttl).toBe(-1)

      await classifier.checkRateLimit()

      const state = await readState()
      expect(state.value).toBe(29)
      expect(state.ttl).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // TTL guarantee — caminho de revert (tokens < 0)
  // -------------------------------------------------------------------------

  describe('TTL guarantee — revert path (tokens < 0)', () => {
    it('key has TTL > 0 after rate limit exceeded and revert', async () => {
      await redis.set(RATE_LIMIT_KEY, '0', 'EX', RATE_LIMIT_TTL)

      await expect(classifier.checkRateLimit()).rejects.toThrow(RateLimitError)

      const state = await readState()
      expect(state.value).toBe(0)
      expect(state.ttl).toBeGreaterThan(0)
    })

    it('key has TTL > 0 after revert even when TTL was lost', async () => {
      await redis.set(RATE_LIMIT_KEY, '0')
      expect((await readState()).ttl).toBe(-1)

      await expect(classifier.checkRateLimit()).rejects.toThrow(RateLimitError)

      const state = await readState()
      expect(state.value).toBe(0)
      expect(state.ttl).toBeGreaterThan(0)
    })

    it('throws RateLimitError with code RATE_001', async () => {
      await redis.set(RATE_LIMIT_KEY, '0', 'EX', RATE_LIMIT_TTL)

      await expect(classifier.checkRateLimit()).rejects.toMatchObject({ code: 'RATE_001' })
    })
  })

  // -------------------------------------------------------------------------
  // Expiracao no meio do fluxo (fix M9)
  // -------------------------------------------------------------------------

  describe('Key expiration mid-flow (M9 fix)', () => {
    it('reinitializes with TTL when key was deleted between calls', async () => {
      await classifier.checkRateLimit()
      expect((await readState()).value).toBe(RATE_LIMIT_MAX - 1)

      // DEL forcado simulando a expiracao natural entre duas operacoes.
      await redis.del(RATE_LIMIT_KEY)
      expect((await readState()).value).toBeNull()

      await classifier.checkRateLimit()

      const state = await readState()
      expect(state.value).toBe(RATE_LIMIT_MAX - 1)
      expect(state.ttl).toBeGreaterThan(0)
    })

    it('reinitializes with TTL when the key expires via PEXPIRE(1)', async () => {
      await classifier.checkRateLimit()

      // Expiracao real do lado do Redis, nao um flag de mock.
      await redis.pexpire(RATE_LIMIT_KEY, 1)
      await new Promise((r) => setTimeout(r, 20))
      expect((await readState()).value).toBeNull()

      await classifier.checkRateLimit()

      const state = await readState()
      expect(state.value).toBe(RATE_LIMIT_MAX - 1)
      expect(state.ttl).toBeGreaterThan(0)
    })

    it('no sequence of operations leaves the key without TTL', async () => {
      // Sequencia adversarial: normal, normal, TTL removido, DEL, esgotamento.
      await classifier.checkRateLimit()
      await classifier.checkRateLimit()
      expect((await readState()).ttl).toBeGreaterThan(0)

      await redis.persist(RATE_LIMIT_KEY) // remove o TTL a forca
      expect((await readState()).ttl).toBe(-1)
      await classifier.checkRateLimit()
      expect((await readState()).ttl).toBeGreaterThan(0)

      await redis.del(RATE_LIMIT_KEY)
      await classifier.checkRateLimit()
      expect((await readState()).ttl).toBeGreaterThan(0)

      await redis.set(RATE_LIMIT_KEY, '0')
      await expect(classifier.checkRateLimit()).rejects.toThrow(RateLimitError)
      const final = await readState()
      expect(final.value).toBe(0)
      expect(final.ttl).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // Corrida de inicializacao (fix M4) — instancias em paralelo real
  // -------------------------------------------------------------------------

  describe('Initialization race (M4 fix)', () => {
    it('SET NX prevents the bucket from being reset by concurrent initializations', async () => {
      const a = new NewsClassifier(redis)
      const b = new NewsClassifier(redis)

      // Paralelismo real: as duas chamadas partem antes de qualquer uma resolver.
      await Promise.all([a.checkRateLimit(), b.checkRateLimit()])

      const state = await readState()
      // Se o SET nao fosse NX, a segunda instancia resetaria o bucket para MAX
      // e o valor final seria MAX - 1 em vez de MAX - 2.
      expect(state.value).toBe(RATE_LIMIT_MAX - 2)
      expect(state.ttl).toBeGreaterThan(0)
    })

    it('N concurrent instances decrement exactly N times, never resetting', async () => {
      const N = 10
      const instances = Array.from({ length: N }, () => new NewsClassifier(redis))

      await Promise.all(instances.map((c) => c.checkRateLimit()))

      const state = await readState()
      expect(state.value).toBe(RATE_LIMIT_MAX - N)
      expect(state.ttl).toBeGreaterThan(0)
    })

    it('second instance does not reset the bucket when key already exists', async () => {
      await redis.set(RATE_LIMIT_KEY, '10', 'EX', RATE_LIMIT_TTL)

      const other = new NewsClassifier(redis)
      await other.checkRateLimit()

      const state = await readState()
      expect(state.value).toBe(9)
      expect(state.ttl).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // Fiacao: eval com os argumentos certos e zero comando legado
  // -------------------------------------------------------------------------

  describe('eval call wiring', () => {
    it('calls redis.eval with the production check-decr script and args', async () => {
      const evalSpy = jest.spyOn(redis, 'eval')

      await classifier.checkRateLimit()

      expect(evalSpy).toHaveBeenCalledTimes(1)
      expect(evalSpy).toHaveBeenCalledWith(
        RATE_LIMIT_CHECK_DECR_SCRIPT,
        1,
        RATE_LIMIT_KEY,
        RATE_LIMIT_MAX,
        RATE_LIMIT_TTL,
      )
    })

    it('calls redis.eval twice when rate limit exceeded (check-decr + revert-incr)', async () => {
      await redis.set(RATE_LIMIT_KEY, '0', 'EX', RATE_LIMIT_TTL)
      const evalSpy = jest.spyOn(redis, 'eval')

      await expect(classifier.checkRateLimit()).rejects.toThrow(RateLimitError)

      expect(evalSpy).toHaveBeenCalledTimes(2)
      expect(evalSpy).toHaveBeenLastCalledWith(
        RATE_LIMIT_REVERT_INCR_SCRIPT,
        1,
        RATE_LIMIT_KEY,
        RATE_LIMIT_TTL,
      )
    })

    it('does NOT call the legacy exists/set/decr/incr/expire commands', async () => {
      const spies = {
        exists: jest.spyOn(redis, 'exists'),
        set: jest.spyOn(redis, 'set'),
        decr: jest.spyOn(redis, 'decr'),
        incr: jest.spyOn(redis, 'incr'),
        expire: jest.spyOn(redis, 'expire'),
      }

      await classifier.checkRateLimit()

      for (const [name, spy] of Object.entries(spies)) {
        expect([name, spy.mock.calls.length]).toEqual([name, 0])
      }
    })
  })

  // -------------------------------------------------------------------------
  // Normalizacao do reply do eval (serializacao varia entre clientes Redis)
  // -------------------------------------------------------------------------

  describe('eval reply normalization', () => {
    it('accepts a string reply as a number (no lexicographic comparison)', async () => {
      // Alguns wrappers devolvem o integer do DECR como string. '5' tem de valer
      // 5 tokens e NAO disparar RateLimitError.
      jest.spyOn(redis, 'eval').mockResolvedValueOnce('5' as never)

      await expect(classifier.checkRateLimit()).resolves.toBeUndefined()
    })

    it('treats a negative string reply as exhausted (reverts and throws)', async () => {
      const evalSpy = jest.spyOn(redis, 'eval')
      evalSpy.mockResolvedValueOnce('-1' as never)

      await expect(classifier.checkRateLimit()).rejects.toThrow(RateLimitError)

      // Segunda chamada = revert-incr; prova que '-1' entrou no ramo de esgotado.
      expect(evalSpy).toHaveBeenLastCalledWith(
        RATE_LIMIT_REVERT_INCR_SCRIPT,
        1,
        RATE_LIMIT_KEY,
        RATE_LIMIT_TTL,
      )
    })

    it('fails closed with RateLimitError when the reply is not interpretable', async () => {
      jest.spyOn(redis, 'eval').mockResolvedValueOnce('PONG' as never)

      await expect(classifier.checkRateLimit()).rejects.toThrow(RateLimitError)
    })

    it('fails closed when the reply is null', async () => {
      jest.spyOn(redis, 'eval').mockResolvedValueOnce(null as never)

      await expect(classifier.checkRateLimit()).rejects.toThrow(RateLimitError)
    })
  })
})
