import { writeFileSync, readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type CoverageRow = {
  source: string
  denominator: bigint | number
  with_attribution: bigint | number
  coverage_pct: number
}

type MovementSampleRow = {
  id: string
  source: string
  timestamp: Date
  previous_close: number
  close: number
  raw_change: number
  has_attribution: boolean
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1)
  return sorted[index] ?? 0
}

function loadTickDurations(): number[] {
  const metricsPath = argValue('--metrics-json') ?? process.env.MOTOR_TICK_METRICS_JSON
  if (!metricsPath) {
    throw new Error('Baseline bloqueado: informe --metrics-json ou MOTOR_TICK_METRICS_JSON com amostras motor_tick_duration_ms.')
  }
  const parsed = JSON.parse(readFileSync(metricsPath, 'utf8')) as unknown
  if (Array.isArray(parsed)) return parsed.filter((value): value is number => typeof value === 'number')
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { motor_tick_duration_ms?: unknown }).motor_tick_duration_ms)) {
    return (parsed as { motor_tick_duration_ms: unknown[] }).motor_tick_duration_ms
      .filter((value): value is number => typeof value === 'number')
  }
  throw new Error('Baseline bloqueado: arquivo de metricas precisa ser array numerico ou conter motor_tick_duration_ms[].')
}

async function main() {
  const from = new Date(argValue('--from') ?? Date.now() - 24 * 60 * 60 * 1000)
  const to = new Date(argValue('--to') ?? Date.now())
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new Error('Periodo invalido. Use --from ISO_DATE --to ISO_DATE.')
  }

  const tickDurations = loadTickDurations()
  if (tickDurations.length < 20) {
    throw new Error(`Baseline bloqueado: ${tickDurations.length} amostras de tick; minimo operacional: 20.`)
  }

  const coverage = await prisma.$queryRawUnsafe<CoverageRow[]>(`
    WITH ordered AS (
      SELECT
        id,
        source,
        timestamp,
        close::float8 AS close,
        LAG(close::float8) OVER (PARTITION BY asset_id ORDER BY timestamp) AS previous_close,
        attribution
      FROM price_history
      WHERE timestamp >= $1 AND timestamp <= $2
    ),
    movements AS (
      SELECT *
      FROM ordered
      WHERE previous_close IS NOT NULL AND close <> previous_close
    )
    SELECT
      source,
      COUNT(*)::bigint AS denominator,
      COUNT(*) FILTER (WHERE attribution IS NOT NULL)::bigint AS with_attribution,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE attribution IS NOT NULL)::numeric / COUNT(*)::numeric) * 100, 2)::float8 END AS coverage_pct
    FROM movements
    GROUP BY source
    ORDER BY source
  `, from, to)

  const sample = await prisma.$queryRawUnsafe<MovementSampleRow[]>(`
    WITH ordered AS (
      SELECT
        id,
        source,
        timestamp,
        close::float8 AS close,
        LAG(close::float8) OVER (PARTITION BY asset_id ORDER BY timestamp) AS previous_close,
        attribution
      FROM price_history
      WHERE timestamp >= $1 AND timestamp <= $2
    )
    SELECT
      id,
      source,
      timestamp,
      previous_close,
      close,
      close - previous_close AS raw_change,
      attribution IS NOT NULL AS has_attribution
    FROM ordered
    WHERE previous_close IS NOT NULL AND close <> previous_close
    ORDER BY ABS(close - previous_close) DESC, timestamp DESC
    LIMIT 20
  `, from, to)

  const report = [
    '# Baseline causal da analise de valor',
    '',
    'Resultado medido.',
    '',
    `- period: ${from.toISOString()} a ${to.toISOString()}`,
    `- motor_tick_duration_ms.p50: ${percentile(tickDurations, 50).toFixed(2)}`,
    `- motor_tick_duration_ms.p95: ${percentile(tickDurations, 95).toFixed(2)}`,
    `- motor_tick_duration_ms.p99: ${percentile(tickDurations, 99).toFixed(2)}`,
    `- tick_samples: ${tickDurations.length}`,
    '',
    '## Cobertura por source',
    '',
    '```json',
    JSON.stringify(coverage, (_key, value) => typeof value === 'bigint' ? Number(value) : value, 2),
    '```',
    '',
    '## Amostra de movimentos',
    '',
    sample.length >= 20 ? 'Amostra minima de 20 movimentos coletada.' : `hipotese: volume insuficiente no periodo; amostra coletada com ${sample.length} movimentos.`,
    '',
    '```json',
    JSON.stringify(sample, (_key, value) => value instanceof Date ? value.toISOString() : value, 2),
    '```',
    '',
  ].join('\n')

  writeFileSync('blacksmith/value-analysis-causal-baseline.md', report)
  console.log(JSON.stringify({ ok: true, coverage, sampleCount: sample.length }, (_key, value) => typeof value === 'bigint' ? Number(value) : value, 2))
}

main()
  .catch((err) => {
    console.error(String(err))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
