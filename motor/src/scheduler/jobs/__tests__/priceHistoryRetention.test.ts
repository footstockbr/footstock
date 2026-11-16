// ============================================================================
// FootStock Motor — retencao de price_history (2026-11-16).
//
// O SQL em si (compactacao horaria com DELETE+UPDATE na mesma instrucao) foi
// validado contra Postgres 16 real; aqui ficam o contrato de configuracao, o
// corte alinhado na hora, o fatiamento por dia, o orcamento de tempo e o
// isolamento de falha por ativo — com o prisma injetado.
// ============================================================================

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import {
  readRetentionConfig,
  runPriceHistoryRetention,
  dayChunks,
  floorToHour,
  __resetRetentionGuard,
  RETENTION_DEFAULTS,
  type RetentionConfig,
  type RetentionPrisma,
} from '../../../services/cron/price-history-retention'

const NOW = new Date('2026-12-20T12:34:56.000Z')
const BASE: RetentionConfig = {
  enabled: true,
  rawDays: 31,
  attributionDays: 31,
  maxRuntimeMs: 60_000,
}

type Call = { sql: string; values: unknown[] }

/**
 * Prisma falso dirigido pelo texto do SQL. `starts` define o inicio pendente
 * de compactacao por ativo; `stripStarts`, o de so-attribution.
 */
function fakePrisma(opts: {
  assets: string[]
  starts?: Record<string, Date | null>
  stripStarts?: Record<string, Date | null>
  failOn?: string
  bytes?: [number, number]
}) {
  const calls: Call[] = []
  let bytesCall = 0
  const $queryRawUnsafe = jest.fn(async (sql: string, ...values: unknown[]) => {
    calls.push({ sql, values })
    if (sql.includes('pg_total_relation_size')) {
      const b = opts.bytes ?? [1000, 900]
      return [{ bytes: BigInt(b[Math.min(bytesCall++, 1)]) }]
    }
    if (sql.includes('FROM assets')) return opts.assets.map(id => ({ id }))
    const assetId = values[0] as string
    if (opts.failOn === assetId) throw new Error('boom')
    if (sql.includes('HAVING count(*) > 1')) return [{ start: opts.starts?.[assetId] ?? null }]
    if (sql.includes('min(timestamp)')) return [{ start: opts.stripStarts?.[assetId] ?? null }]
    if (sql.includes('row_number()')) return [{ deleted: 10, stripped: 2 }]
    if (sql.includes('SET attribution = NULL')) return [{ stripped: 5 }]
    throw new Error(`SQL inesperado: ${sql}`)
  })
  return { prisma: { $queryRawUnsafe } as unknown as RetentionPrisma, calls }
}

const compactCalls = (calls: Call[]) => calls.filter(c => c.sql.includes('row_number()'))
const stripCalls = (calls: Call[]) =>
  calls.filter(c => c.sql.includes('SET attribution = NULL') && !c.sql.includes('row_number()'))

beforeEach(() => {
  jest.clearAllMocks()
  __resetRetentionGuard()
})

describe('readRetentionConfig', () => {
  it('defaults: ligado, 31 dias brutos, attribution acompanha o bruto', () => {
    expect(readRetentionConfig({})).toEqual({
      enabled: true,
      rawDays: 31,
      attributionDays: 31,
      maxRuntimeMs: RETENTION_DEFAULTS.maxRuntimeMs,
    })
  })

  it('kill switch so com "false" explicito', () => {
    expect(readRetentionConfig({ PRICE_HISTORY_RETENTION_ENABLED: 'false' }).enabled).toBe(false)
    expect(readRetentionConfig({ PRICE_HISTORY_RETENTION_ENABLED: 'FALSE' }).enabled).toBe(false)
    expect(readRetentionConfig({ PRICE_HISTORY_RETENTION_ENABLED: '0' }).enabled).toBe(true)
  })

  it('valor invalido ou abaixo do minimo cai no default, nunca em zero', () => {
    const c = readRetentionConfig({
      PRICE_HISTORY_RAW_RETENTION_DAYS: '0',
      PRICE_HISTORY_ATTRIBUTION_RETENTION_DAYS: 'abc',
    })
    expect(c.rawDays).toBe(31)
    expect(c.attributionDays).toBe(31)
    expect(readRetentionConfig({ PRICE_HISTORY_RAW_RETENTION_DAYS: '7' }).rawDays).toBe(31)
    expect(readRetentionConfig({ PRICE_HISTORY_RAW_RETENTION_DAYS: '2.5' }).rawDays).toBe(31)
  })

  it('attribution pode ser menor que o bruto, nunca maior', () => {
    expect(
      readRetentionConfig({
        PRICE_HISTORY_RAW_RETENTION_DAYS: '60',
        PRICE_HISTORY_ATTRIBUTION_RETENTION_DAYS: '14',
      })
    ).toMatchObject({ rawDays: 60, attributionDays: 14 })
    expect(
      readRetentionConfig({
        PRICE_HISTORY_RAW_RETENTION_DAYS: '20',
        PRICE_HISTORY_ATTRIBUTION_RETENTION_DAYS: '45',
      })
    ).toMatchObject({ rawDays: 20, attributionDays: 20 })
  })
})

describe('helpers de tempo', () => {
  it('floorToHour corta minutos e segundos', () => {
    expect(floorToHour(NOW).toISOString()).toBe('2026-12-20T12:00:00.000Z')
  })

  it('dayChunks cobre [start, end) em fatias de no maximo 24h, sem buraco nem sobreposicao', () => {
    const start = new Date('2026-11-01T05:00:00.000Z')
    const end = new Date('2026-11-03T12:00:00.000Z')
    const chunks = dayChunks(start, end)
    expect(chunks.map(([a, b]) => [a.toISOString(), b.toISOString()])).toEqual([
      ['2026-11-01T05:00:00.000Z', '2026-11-02T05:00:00.000Z'],
      ['2026-11-02T05:00:00.000Z', '2026-11-03T05:00:00.000Z'],
      ['2026-11-03T05:00:00.000Z', '2026-11-03T12:00:00.000Z'],
    ])
    expect(dayChunks(end, end)).toEqual([])
  })
})

describe('runPriceHistoryRetention', () => {
  it('desligado: nao toca o banco', async () => {
    const { prisma } = fakePrisma({ assets: ['a1'] })
    const r = await runPriceHistoryRetention({
      prisma,
      config: { ...BASE, enabled: false },
      now: () => NOW,
    })
    expect(r.status).toBe('disabled')
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
  })

  it('corte bruto alinhado na hora e passado como parametro (nada interpolado no SQL)', async () => {
    const { prisma, calls } = fakePrisma({ assets: ['a1'] })
    const r = await runPriceHistoryRetention({ prisma, config: BASE, now: () => NOW })
    expect(r.rawCutoff).toBe('2026-11-19T12:00:00.000Z')
    const startCall = calls.find(c => c.sql.includes('HAVING count(*) > 1'))!
    expect(startCall.values).toEqual(['a1', '2026-11-19T12:00:00.000Z'])
    expect(startCall.sql).not.toContain('a1')
  })

  it('todo corte vai como texto ISO com ::timestamp — imune ao TimeZone da sessao', async () => {
    const { prisma, calls } = fakePrisma({
      assets: ['a1'],
      starts: { a1: new Date('2026-11-19T00:00:00.000Z') },
    })
    await runPriceHistoryRetention({ prisma, config: { ...BASE, attributionDays: 14 }, now: () => NOW })
    const parametrized = calls.filter(c => c.values.length > 1)
    expect(parametrized.length).toBeGreaterThan(0)
    for (const c of parametrized) {
      for (const v of c.values.slice(1)) expect(typeof v).toBe('string')
      expect(c.sql).toMatch(/\$2::timestamp/)
    }
  })

  it('sem trabalho pendente: nenhuma instrucao de escrita', async () => {
    const { prisma, calls } = fakePrisma({ assets: ['a1', 'a2'] })
    const r = await runPriceHistoryRetention({ prisma, config: BASE, now: () => NOW })
    expect(r).toMatchObject({
      status: 'completed',
      assets: 2,
      statements: 0,
      deleted: 0,
      stripped: 0,
    })
    expect(compactCalls(calls)).toHaveLength(0)
  })

  it('compacta do inicio pendente ate o corte, um dia por instrucao, e soma os contadores', async () => {
    const { prisma, calls } = fakePrisma({
      assets: ['a1'],
      starts: { a1: new Date('2026-11-17T10:00:00.000Z') },
      bytes: [5000, 4000],
    })
    const r = await runPriceHistoryRetention({ prisma, config: BASE, now: () => NOW })
    const chunks = compactCalls(calls)
    // 17/11 10h -> 19/11 12h = 2 dias + 2h = 3 fatias
    expect(chunks.map(c => c.values[1])).toEqual([
      '2026-11-17T10:00:00.000Z',
      '2026-11-18T10:00:00.000Z',
      '2026-11-19T10:00:00.000Z',
    ])
    expect(chunks[2].values[2]).toBe('2026-11-19T12:00:00.000Z')
    expect(r).toMatchObject({
      status: 'completed',
      statements: 3,
      deleted: 30,
      stripped: 6,
      tableBytesBefore: 5000,
      tableBytesAfter: 4000,
    })
  })

  it('com attribution menor que o bruto, anula so a janela intermediaria', async () => {
    const { prisma, calls } = fakePrisma({
      assets: ['a1'],
      stripStarts: { a1: new Date('2026-12-05T13:27:00.000Z') },
    })
    const r = await runPriceHistoryRetention({
      prisma,
      config: { ...BASE, rawDays: 31, attributionDays: 14 },
      now: () => NOW,
    })
    expect(r.attributionCutoff).toBe('2026-12-06T12:00:00.000Z')
    const strips = stripCalls(calls)
    expect(strips).toHaveLength(1)
    expect(strips[0].values).toEqual([
      'a1',
      '2026-12-05T13:00:00.000Z',
      '2026-12-06T12:00:00.000Z',
    ])
    expect(r.stripped).toBe(5)
  })

  it('com attribution igual ao bruto, o passo so-attribution nem consulta', async () => {
    const { prisma, calls } = fakePrisma({ assets: ['a1'] })
    await runPriceHistoryRetention({ prisma, config: BASE, now: () => NOW })
    expect(calls.some(c => c.sql.includes('min(timestamp)'))).toBe(false)
  })

  it('falha num ativo nao impede os outros', async () => {
    const { prisma } = fakePrisma({
      assets: ['a1', 'a2'],
      failOn: 'a1',
      starts: { a2: new Date('2026-11-19T00:00:00.000Z') },
    })
    const r = await runPriceHistoryRetention({ prisma, config: BASE, now: () => NOW })
    expect(r).toMatchObject({ status: 'completed', failedAssets: 1, statements: 1, deleted: 10 })
  })

  it('orcamento estourado para entre instrucoes e reporta budget_exhausted', async () => {
    const { prisma, calls } = fakePrisma({
      assets: ['a1', 'a2'],
      starts: {
        a1: new Date('2026-11-10T12:00:00.000Z'),
        a2: new Date('2026-11-10T12:00:00.000Z'),
      },
    })
    let t = 0
    // Cada leitura do relogio avanca 10s; orcamento de 35s.
    const clock = () => (t += 10_000)
    const r = await runPriceHistoryRetention({
      prisma,
      config: { ...BASE, maxRuntimeMs: 35_000 },
      now: () => NOW,
      clock,
    })
    expect(r.status).toBe('budget_exhausted')
    expect(compactCalls(calls).length).toBeLessThan(9)
    expect(compactCalls(calls).every(c => c.values[0] === 'a1')).toBe(true)
  })

  it('nao roda duas vezes em paralelo no mesmo processo', async () => {
    let release!: () => void
    const gate = new Promise<void>(res => (release = res))
    const $queryRawUnsafe = jest.fn(async (sql: string) => {
      if (sql.includes('pg_total_relation_size')) {
        await gate
        return [{ bytes: 1n }]
      }
      return []
    })
    const first = runPriceHistoryRetention({
      prisma: { $queryRawUnsafe } as unknown as RetentionPrisma,
      config: BASE,
      now: () => NOW,
    })
    const second = await runPriceHistoryRetention({
      prisma: { $queryRawUnsafe } as unknown as RetentionPrisma,
      config: BASE,
      now: () => NOW,
    })
    expect(second.status).toBe('already_running')
    release()
    expect((await first).status).toBe('completed')
    // Guard liberado ao fim: a proxima execucao roda normalmente.
    const third = await runPriceHistoryRetention({
      prisma: { $queryRawUnsafe } as unknown as RetentionPrisma,
      config: BASE,
      now: () => NOW,
    })
    expect(third.status).toBe('completed')
  })
})
