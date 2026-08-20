// ============================================================================
// Dedup de notícia — URL e assinatura de título.
//
// O dedup por título nasceu de um caso real do admin em 2026-08-03: o "6º Leilão
// do Instituto" apareceu duas vezes, em grupos distintos, porque chegou por duas
// URLs diferentes. A URL sozinha não descreve o FATO noticioso.
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import {
  NEWS_TITLE_FINGERPRINTS_KEY,
  NEWS_URLS_KEY,
  URL_TTL_SECONDS,
  isTitleDuplicate,
  markAsProcessed,
  markTitleAsProcessed,
  titleDedupKey,
  titleFingerprint,
  unmarkAsProcessed,
  urlDedupKey,
} from '../news-dedup'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

describe('titleFingerprint', () => {
  test('mesma manchete com pontuação, caixa e acento diferentes colapsa na mesma assinatura', () => {
    // As três formas abaixo são a MESMA matéria republicada por fontes distintas.
    const base = titleFingerprint('Fim de semana em mansão: os lotes do 6º Leilão do Instituto')

    expect(titleFingerprint('FIM DE SEMANA EM MANSAO - OS LOTES DO 6º LEILAO DO INSTITUTO')).toBe(base)
    expect(titleFingerprint('  Fim de semana em mansão,  os lotes do 6º Leilão do Instituto!  ')).toBe(base)
  })

  test('manchetes diferentes têm assinaturas diferentes', () => {
    expect(titleFingerprint('Flamengo vence o clássico')).not.toBe(
      titleFingerprint('Flamengo perde o clássico')
    )
  })

  test('assinatura é estável entre execuções (é hash, não aleatório)', () => {
    expect(titleFingerprint('Palmeiras anuncia reforço')).toBe(
      titleFingerprint('Palmeiras anuncia reforço')
    )
  })

  test('assinatura tem 16 chars hex — o suficiente para a janela de 48h', () => {
    expect(titleFingerprint('Qualquer manchete')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('dedup por título', () => {
  let redis: Redis

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis
  })

  test('título ainda não visto não é duplicata', async () => {
    expect(await isTitleDuplicate(redis, 'Flamengo vence')).toBe(false)
  })

  test('título marcado passa a ser duplicata', async () => {
    await markTitleAsProcessed(redis, 'Flamengo vence')

    expect(await isTitleDuplicate(redis, 'Flamengo vence')).toBe(true)
  })

  test('a MESMA matéria por outra URL é pega pelo título', async () => {
    // O caso do leilão duplicado: URLs distintas, fato idêntico.
    await markAsProcessed(redis, 'https://a.com/leilao-instituto')
    await markTitleAsProcessed(redis, 'Os lotes do 6º Leilão do Instituto')

    expect(await isTitleDuplicate(redis, 'os lotes do 6o Leilao do Instituto')).toBe(false)
    // (o "6º" vira "6" e o "6o" vira "6 o" — variação tipográfica real não colapsa)
    expect(await isTitleDuplicate(redis, 'OS LOTES DO 6º LEILÃO DO INSTITUTO!')).toBe(true)
  })

  test('a marca de título tem TTL, senão a chave cresce para sempre', async () => {
    await markTitleAsProcessed(redis, 'Flamengo vence')

    const ttl = await redis.ttl(titleDedupKey('Flamengo vence'))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(URL_TTL_SECONDS)
  })
})

describe('unmarkAsProcessed', () => {
  let redis: Redis

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis
  })

  test('libera URL e assinatura JUNTAS', async () => {
    // Liberar só a URL trocaria a perda-por-48h por um bug idêntico: o ciclo
    // seguinte traria a URL de volta e o dedup de TÍTULO a barraria.
    const url = 'https://a.com/1'
    const title = 'Flamengo vence'
    await markAsProcessed(redis, url)
    await markTitleAsProcessed(redis, title)

    expect(await unmarkAsProcessed(redis, url, title)).toBe(true)

    expect(await redis.exists(urlDedupKey(url))).toBe(0)
    expect(await redis.sismember(NEWS_URLS_KEY, url)).toBe(0)
    expect(await isTitleDuplicate(redis, title)).toBe(false)
  })

  test('sem título informado, só a URL é liberada', async () => {
    await markAsProcessed(redis, 'https://a.com/1')
    await markTitleAsProcessed(redis, 'Flamengo vence')

    await unmarkAsProcessed(redis, 'https://a.com/1')

    expect(await isTitleDuplicate(redis, 'Flamengo vence')).toBe(true)
  })

  test('Redis fora degrada em false, sem lançar — quem chama já está tratando um erro', async () => {
    const brokenRedis = {
      del: jest.fn().mockRejectedValue(new Error('Redis fora')),
      srem: jest.fn().mockRejectedValue(new Error('Redis fora')),
    } as unknown as Redis

    await expect(unmarkAsProcessed(brokenRedis, 'https://a.com/1', 't')).resolves.toBe(false)
  })

  test('dual-unmark zera chave nova e membro legado', async () => {
    const url = 'https://a.com/legado'
    const title = 'Flamengo vence'
    await redis.sadd(NEWS_URLS_KEY, url)
    await redis.sadd(NEWS_TITLE_FINGERPRINTS_KEY, titleFingerprint(title))
    await markAsProcessed(redis, url)
    await markTitleAsProcessed(redis, title)

    expect(await unmarkAsProcessed(redis, url, title)).toBe(true)

    expect(await redis.exists(urlDedupKey(url))).toBe(0)
    expect(await redis.sismember(NEWS_URLS_KEY, url)).toBe(0)
    expect(await redis.exists(titleDedupKey(title))).toBe(0)
    expect(await redis.sismember(NEWS_TITLE_FINGERPRINTS_KEY, titleFingerprint(title))).toBe(0)
    expect(await isTitleDuplicate(redis, title)).toBe(false)
  })
})

describe('TTL por item (T-15)', () => {
  let redis: Redis

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis
  })

  test('expirar URL A nao libera URL B', async () => {
    const urlA = 'https://a.com/a'
    const urlB = 'https://a.com/b'
    expect(await markAsProcessed(redis, urlA)).toBe(true)
    expect(await markAsProcessed(redis, urlB)).toBe(true)

    await redis.expire(urlDedupKey(urlA), 1)
    await sleep(1100)

    expect(await redis.exists(urlDedupKey(urlA))).toBe(0)
    expect(await redis.exists(urlDedupKey(urlB))).toBe(1)
  }, 5000)

  test('expirar fingerprint A nao libera fingerprint B', async () => {
    await markTitleAsProcessed(redis, 'Titulo A')
    await markTitleAsProcessed(redis, 'Titulo B')

    await redis.expire(titleDedupKey('Titulo A'), 1)
    await sleep(1100)

    expect(await redis.exists(titleDedupKey('Titulo A'))).toBe(0)
    expect(await redis.exists(titleDedupKey('Titulo B'))).toBe(1)
    expect(await isTitleDuplicate(redis, 'Titulo A')).toBe(false)
    expect(await isTitleDuplicate(redis, 'Titulo B')).toBe(true)
  }, 5000)

  test('re-avistamento nao renova o TTL (SET NX)', async () => {
    const url = 'https://a.com/ttl'
    expect(await markAsProcessed(redis, url)).toBe(true)
    const ttl1 = await redis.ttl(urlDedupKey(url))
    expect(ttl1).toBeGreaterThan(0)
    expect(ttl1).toBeLessThanOrEqual(URL_TTL_SECONDS)

    await sleep(1100)
    expect(await markAsProcessed(redis, url)).toBe(false)

    const ttl2 = await redis.ttl(urlDedupKey(url))
    expect(ttl2).toBeGreaterThan(0)
    expect(ttl2).toBeLessThan(ttl1)
  }, 5000)

  test('SET legado sem chave nova e duplicata; migracao grava a chave nova', async () => {
    const url = 'https://a.com/legado'
    await redis.sadd(NEWS_URLS_KEY, url)

    expect(await markAsProcessed(redis, url)).toBe(false)
    expect(await redis.exists(urlDedupKey(url))).toBe(1)
  })

  test('marca nova nao chama expire no SET legado', async () => {
    const url = 'https://a.com/sem-expire-set'
    await redis.sadd(NEWS_URLS_KEY, url)
    await redis.expire(NEWS_URLS_KEY, 30)
    const ttlBefore = await redis.ttl(NEWS_URLS_KEY)

    await markAsProcessed(redis, url)

    const ttlAfter = await redis.ttl(NEWS_URLS_KEY)
    expect(ttlAfter).toBeGreaterThan(0)
    expect(ttlAfter).toBeLessThanOrEqual(ttlBefore)
    expect(ttlAfter).toBeLessThan(URL_TTL_SECONDS)
  })
})
