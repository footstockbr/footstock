// ============================================================================
// FootStock Motor — price-history-retention
//
// POR QUE EXISTE (incidente 2026-10-29 -> 2026-11-16). `price_history` nunca
// teve retencao. O motor grava um snapshot por ativo a cada tick (~2.100 linhas
// por ativo por dia) e cada linha carrega `attribution jsonb` de ~3 KB. Em cinco
// meses a tabela chegou a 45 GB (38 GB so de TOAST da attribution), encheu o
// volume de 50 GB do Postgres, o banco entrou em crash loop e a API ficou 503
// por ~18 dias. A tabela foi truncada na recuperacao; sem este job ela enche de
// novo no mesmo ritmo.
//
// O QUE UMA LINHA E. Cada linha e um SNAPSHOT, nao uma vela: `open/high/low` sao
// acumulados do dia e `volume` e contador cumulativo (ver
// footstock-next/src/lib/repositories/PriceHistoryRepository.ts, que monta as
// velas a partir de `close` e de deltas de volume). Consequencia: compactar e
// MANTER O ULTIMO SNAPSHOT DE CADA HORA intacto e apagar os demais. Agregar
// open/high/low/volume da hora estaria errado — o ultimo snapshot ja carrega o
// acumulado correto.
//
// POLITICA (dois cortes, ambos configuraveis por env):
//   1. Linhas mais velhas que RAW_DAYS (default 31): compactadas para 1 snapshot
//      por ativo por hora UTC, com `attribution` anulada. Ficam para sempre
//      (~350 mil linhas/ano para 40 ativos, sem jsonb).
//   2. Linhas entre ATTRIBUTION_DAYS e RAW_DAYS: so perdem `attribution`. Com o
//      default (ATTRIBUTION_DAYS = RAW_DAYS) este passo nao faz nada.
//
// POR QUE 31 DIAS. Os leitores que precisam de granularidade fina olham no
// maximo 30 dias para tras: grafico 1M (velas de 4h), analise de valor do admin
// (MAX_DAYS = 30, unica leitora pesada de `attribution`), dashboard do clube
// (ate 90d, mas por dia). DelayService, high/low 24h e grafico 1D/1W olham
// horas ou dias. Historico de portfolio e liga P1 agregam por DIA — o snapshot
// horario basta. Fora da janela, analise de valor cai no caminho degradado ja
// previsto para `attribution = null`.
//
// CUSTO. Cada instrucao toca um ativo e no maximo um dia de linhas, usando o
// indice (asset_id, timestamp). O inicio de cada ativo e o dia mais antigo que
// ainda tem trabalho, entao o regime permanente processa ~1 dia por ativo por
// execucao. Ha orcamento de tempo: se estourar, para entre instrucoes e a
// proxima execucao continua de onde parou (o trabalho e idempotente).
//
// ESPACO. DELETE/UPDATE nao encolhem o arquivo: o autovacuum marca o espaco
// como reutilizavel e as novas linhas o ocupam. O objetivo e o tamanho parar de
// crescer, nao devolver disco ao volume (isso exigiria VACUUM FULL, que trava a
// tabela e nao roda aqui).
// ============================================================================

import { logger } from '../../utils/logger'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

export const RETENTION_DEFAULTS = {
  rawDays: 31,
  /** Grafico 1W usa velas de 1h sobre 7 dias: abaixo disso ele perderia detalhe. */
  minRawDays: 8,
  minAttributionDays: 1,
  maxRuntimeMs: 15 * 60_000,
} as const

export interface RetentionConfig {
  enabled: boolean
  rawDays: number
  attributionDays: number
  maxRuntimeMs: number
}

/** Le a configuracao do ambiente. Valor invalido cai no default com aviso — nunca em zero. */
export function readRetentionConfig(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  const enabled = (env.PRICE_HISTORY_RETENTION_ENABLED ?? 'true').toLowerCase() !== 'false'

  const rawDays = parseDays(
    env.PRICE_HISTORY_RAW_RETENTION_DAYS,
    RETENTION_DEFAULTS.rawDays,
    RETENTION_DEFAULTS.minRawDays,
    'PRICE_HISTORY_RAW_RETENTION_DAYS'
  )
  let attributionDays = parseDays(
    env.PRICE_HISTORY_ATTRIBUTION_RETENTION_DAYS,
    rawDays,
    RETENTION_DEFAULTS.minAttributionDays,
    'PRICE_HISTORY_ATTRIBUTION_RETENTION_DAYS'
  )
  if (attributionDays > rawDays) {
    // Linha compactada ja perde a attribution; manter mais tempo e impossivel.
    logger.warn(
      `[cron/price-history-retention] ATTRIBUTION_RETENTION_DAYS=${attributionDays} > ` +
        `RAW_RETENTION_DAYS=${rawDays}; usando ${rawDays}.`
    )
    attributionDays = rawDays
  }

  const maxRuntimeMs = parseDays(
    env.PRICE_HISTORY_RETENTION_MAX_RUNTIME_MS,
    RETENTION_DEFAULTS.maxRuntimeMs,
    1_000,
    'PRICE_HISTORY_RETENTION_MAX_RUNTIME_MS'
  )

  return { enabled, rawDays, attributionDays, maxRuntimeMs }
}

function parseDays(raw: string | undefined, fallback: number, min: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min) {
    logger.warn(
      `[cron/price-history-retention] ${name}="${raw}" invalido (inteiro >= ${min}); usando ${fallback}.`
    )
    return fallback
  }
  return n
}

/** Subconjunto do PrismaClient usado aqui — injetavel nos testes. */
export interface RetentionPrisma {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

export interface RetentionDeps {
  prisma: RetentionPrisma
  config?: RetentionConfig
  now?: () => Date
  /** Relogio monotonico para o orcamento de tempo. */
  clock?: () => number
}

export interface RetentionResult {
  status: 'disabled' | 'completed' | 'budget_exhausted' | 'already_running'
  rawCutoff: string | null
  attributionCutoff: string | null
  assets: number
  statements: number
  /** Snapshots apagados pela compactacao horaria. */
  deleted: number
  /** Linhas que perderam `attribution` (compactadas + so-attribution). */
  stripped: number
  /** Ativos cuja instrucao falhou; os demais seguem. */
  failedAssets: number
  tableBytesBefore: number | null
  tableBytesAfter: number | null
  durationMs: number
}

// ─── SQL ─────────────────────────────────────────────────────────────────────
// `price_history.timestamp` e `timestamp without time zone` gravado em UTC pelo
// Prisma; date_trunc('hour', ...) portanto corta hora UTC.
//
// FUSO DOS PARAMETROS. Um `Date` passado ao $queryRawUnsafe chega como
// timestamptz e o Postgres o converte para `timestamp` pelo TimeZone DA SESSAO.
// Com sessao fora de UTC o corte andaria horas (pego em teste contra Postgres
// real com TimeZone=America/Sao_Paulo: 3h de linhas ficavam sem compactar).
// Por isso os cortes vao como ISO-8601 com `::timestamp`, cast que ignora o
// designador de fuso e independe da sessao. Ver pgTs().

/** Hora mais antiga, antes do corte, que ainda tem mais de 1 snapshot ou attribution. */
const SQL_COMPACT_START = `
  SELECT min(h) AS start
  FROM (
    SELECT date_trunc('hour', timestamp) AS h
    FROM price_history
    WHERE asset_id = $1 AND timestamp < $2::timestamp
    GROUP BY 1
    HAVING count(*) > 1 OR bool_or(attribution IS NOT NULL)
  ) pending
`

/**
 * Compacta um intervalo de um ativo: o ultimo snapshot de cada hora fica (sem
 * attribution), os demais saem. DELETE e UPDATE tocam linhas disjuntas (rn > 1
 * vs rn = 1), condicao para dois CTEs de escrita na mesma instrucao.
 */
const SQL_COMPACT_CHUNK = `
  WITH win AS (
    SELECT id,
           attribution IS NOT NULL AS has_attr,
           row_number() OVER (
             PARTITION BY date_trunc('hour', timestamp)
             ORDER BY timestamp DESC, id DESC
           ) AS rn
    FROM price_history
    WHERE asset_id = $1 AND timestamp >= $2::timestamp AND timestamp < $3::timestamp
  ),
  del AS (
    DELETE FROM price_history p
    USING win w
    WHERE p.id = w.id AND w.rn > 1
    RETURNING 1
  ),
  upd AS (
    UPDATE price_history p
    SET attribution = NULL
    FROM win w
    WHERE p.id = w.id AND w.rn = 1 AND w.has_attr
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM del)::int AS deleted,
         (SELECT count(*) FROM upd)::int AS stripped
`

const SQL_STRIP_START = `
  SELECT min(timestamp) AS start
  FROM price_history
  WHERE asset_id = $1 AND timestamp >= $2::timestamp AND timestamp < $3::timestamp AND attribution IS NOT NULL
`

const SQL_STRIP_CHUNK = `
  WITH upd AS (
    UPDATE price_history
    SET attribution = NULL
    WHERE asset_id = $1 AND timestamp >= $2::timestamp AND timestamp < $3::timestamp AND attribution IS NOT NULL
    RETURNING 1
  )
  SELECT count(*)::int AS stripped FROM upd
`

const SQL_ASSETS = `SELECT id FROM assets ORDER BY id`

const SQL_TABLE_BYTES = `SELECT pg_total_relation_size('price_history')::bigint AS bytes`

// ─── Execucao ────────────────────────────────────────────────────────────────

/** Uma execucao por processo. O scheduler ja restringe ao lider. */
let running = false

/** Somente para teste. */
export function __resetRetentionGuard(): void {
  running = false
}

/** Cortes como texto ISO UTC, lidos por `$n::timestamp` (ver nota de fuso no SQL). */
export function pgTs(d: Date): string {
  return d.toISOString()
}

export function floorToHour(d: Date): Date {
  return new Date(Math.floor(d.getTime() / HOUR_MS) * HOUR_MS)
}

export async function runPriceHistoryRetention(deps: RetentionDeps): Promise<RetentionResult> {
  const config = deps.config ?? readRetentionConfig()
  const clock = deps.clock ?? (() => Date.now())
  const startedAt = clock()

  const result: RetentionResult = {
    status: 'completed',
    rawCutoff: null,
    attributionCutoff: null,
    assets: 0,
    statements: 0,
    deleted: 0,
    stripped: 0,
    failedAssets: 0,
    tableBytesBefore: null,
    tableBytesAfter: null,
    durationMs: 0,
  }

  if (!config.enabled) {
    logger.info('[cron/price-history-retention] desligado (PRICE_HISTORY_RETENTION_ENABLED=false).')
    result.status = 'disabled'
    return result
  }
  if (running) {
    logger.warn('[cron/price-history-retention] execucao anterior ainda em andamento; pulando.')
    result.status = 'already_running'
    return result
  }
  running = true

  try {
    const now = (deps.now ?? (() => new Date()))()
    // Corte alinhado na hora: uma hora nunca fica metade compactada.
    const rawCutoff = floorToHour(new Date(now.getTime() - config.rawDays * DAY_MS))
    const attributionCutoff = floorToHour(new Date(now.getTime() - config.attributionDays * DAY_MS))
    result.rawCutoff = rawCutoff.toISOString()
    result.attributionCutoff = attributionCutoff.toISOString()

    const overBudget = () => clock() - startedAt >= config.maxRuntimeMs

    result.tableBytesBefore = await tableBytes(deps.prisma)

    const assets = await deps.prisma.$queryRawUnsafe<Array<{ id: string }>>(SQL_ASSETS)
    result.assets = assets.length

    for (const { id: assetId } of assets) {
      if (overBudget()) {
        result.status = 'budget_exhausted'
        break
      }
      try {
        const exhausted = await processAsset(
          deps.prisma,
          assetId,
          rawCutoff,
          attributionCutoff,
          overBudget,
          result
        )
        if (exhausted) {
          result.status = 'budget_exhausted'
          break
        }
      } catch (err) {
        // Um ativo com problema nao impede os demais; a proxima execucao tenta de novo.
        result.failedAssets++
        logger.error(
          `[cron/price-history-retention] falha no ativo ${assetId}: ${(err as Error).message}`
        )
      }
    }

    result.tableBytesAfter = await tableBytes(deps.prisma)
  } finally {
    running = false
    result.durationMs = clock() - startedAt
  }

  logger.info(
    JSON.stringify({
      event: 'price_history_retention',
      ...result,
    })
  )
  return result
}

/** Retorna `true` se o orcamento acabou no meio do ativo. */
async function processAsset(
  prisma: RetentionPrisma,
  assetId: string,
  rawCutoff: Date,
  attributionCutoff: Date,
  overBudget: () => boolean,
  result: RetentionResult
): Promise<boolean> {
  // 1) Compactacao horaria de tudo antes do corte bruto.
  const [compact] = await prisma.$queryRawUnsafe<Array<{ start: Date | null }>>(
    SQL_COMPACT_START,
    assetId,
    pgTs(rawCutoff)
  )
  if (compact?.start) {
    for (const [from, to] of dayChunks(compact.start, rawCutoff)) {
      if (overBudget()) return true
      const [row] = await prisma.$queryRawUnsafe<Array<{ deleted: number; stripped: number }>>(
        SQL_COMPACT_CHUNK,
        assetId,
        pgTs(from),
        pgTs(to)
      )
      result.statements++
      result.deleted += Number(row?.deleted ?? 0)
      result.stripped += Number(row?.stripped ?? 0)
    }
  }

  // 2) So attribution, entre o corte bruto e o corte de attribution.
  if (attributionCutoff.getTime() > rawCutoff.getTime()) {
    const [strip] = await prisma.$queryRawUnsafe<Array<{ start: Date | null }>>(
      SQL_STRIP_START,
      assetId,
      pgTs(rawCutoff),
      pgTs(attributionCutoff)
    )
    if (strip?.start) {
      for (const [from, to] of dayChunks(floorToHour(strip.start), attributionCutoff)) {
        if (overBudget()) return true
        const [row] = await prisma.$queryRawUnsafe<Array<{ stripped: number }>>(
          SQL_STRIP_CHUNK,
          assetId,
          pgTs(from),
          pgTs(to)
        )
        result.statements++
        result.stripped += Number(row?.stripped ?? 0)
      }
    }
  }
  return false
}

/** Fatias [from, to) de no maximo 24h cobrindo [start, end). */
export function dayChunks(start: Date, end: Date): Array<[Date, Date]> {
  const chunks: Array<[Date, Date]> = []
  let cur = start.getTime()
  const stop = end.getTime()
  while (cur < stop) {
    const next = Math.min(cur + DAY_MS, stop)
    chunks.push([new Date(cur), new Date(next)])
    cur = next
  }
  return chunks
}

async function tableBytes(prisma: RetentionPrisma): Promise<number | null> {
  try {
    const [row] = await prisma.$queryRawUnsafe<Array<{ bytes: bigint | number }>>(SQL_TABLE_BYTES)
    return row ? Number(row.bytes) : null
  } catch {
    return null
  }
}
