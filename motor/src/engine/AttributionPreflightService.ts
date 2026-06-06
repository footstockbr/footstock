import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { PrismaClient } from '@prisma/client'
import { buildPriceAttributionV2, parsePriceAttribution } from './PriceAttribution'
import { motorMetrics } from '../utils/logger'
import type { SessionType } from '../types/motor.types'

type ColumnExistsRow = { exists: boolean }
type AssetIdRow = { id: string }
type EnumLabelRow = { enumlabel: string }
type AttributionRow = { attribution: unknown }

export type AttributionPreflightFailure = {
  code: string
  message: string
}

export type AttributionPreflightResult = {
  ok: boolean
  failures: string[]
  checks: {
    columns: boolean
    schemaSync: boolean
    metrics: boolean
    parserCanary: boolean
    transactionalCanary: boolean
  }
  details: AttributionPreflightFailure[]
}

const CANARY_ROLLBACK = Symbol('ATTRIBUTION_PREFLIGHT_CANARY_ROLLBACK')

function normalizePrismaBlock(block: string): string {
  return block
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
    .join('\n')
}

export function extractPrismaBlock(schema: string, kind: 'model' | 'enum', name: string): string | null {
  const pattern = new RegExp(`${kind}\\s+${name}\\s+\\{`, 'g')
  const match = pattern.exec(schema)
  if (!match) return null

  let depth = 0
  for (let index = match.index; index < schema.length; index++) {
    const char = schema[index]
    if (char === '{') depth++
    if (char === '}') {
      depth--
      if (depth === 0) return schema.slice(match.index, index + 1)
    }
  }
  return null
}

export function comparePriceHistoryContract(rootSchema: string, nextSchema: string): string[] {
  const failures: string[] = []
  for (const [kind, name] of [
    ['model', 'PriceHistory'],
    ['enum', 'SessionType'],
  ] as const) {
    const rootBlock = extractPrismaBlock(rootSchema, kind, name)
    const nextBlock = extractPrismaBlock(nextSchema, kind, name)
    if (!rootBlock || !nextBlock) {
      failures.push(`${kind} ${name} ausente em um dos schemas Prisma`)
      continue
    }
    if (normalizePrismaBlock(rootBlock) !== normalizePrismaBlock(nextBlock)) {
      failures.push(`${kind} ${name} divergente entre prisma/schema.prisma e footstock-next/prisma/schema.prisma`)
    }
  }
  return failures
}

export class AttributionPreflightService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly workspaceRoot = resolve(process.cwd(), '..')
  ) {}

  async run(): Promise<AttributionPreflightResult> {
    const details: AttributionPreflightFailure[] = []
    const checks = {
      columns: false,
      schemaSync: false,
      metrics: false,
      parserCanary: false,
      transactionalCanary: false,
    }

    checks.columns = await this.checkColumns(details)
    checks.schemaSync = this.checkPrismaSchemaSync(details)
    checks.metrics = this.checkMetrics(details)
    checks.parserCanary = this.checkParserCanary(details)
    checks.transactionalCanary = await this.checkTransactionalCanary(details)

    const failures = details.map((failure) => `${failure.code}: ${failure.message}`)
    return { ok: failures.length === 0, failures, checks, details }
  }

  private async checkColumns(details: AttributionPreflightFailure[]): Promise<boolean> {
    let ok = true
    for (const column of ['source', 'attribution'] as const) {
      try {
        const rows = await this.prisma.$queryRawUnsafe(`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'price_history'
              AND column_name = '${column}'
          ) AS exists
        `) as ColumnExistsRow[]
        if (rows[0]?.exists !== true) {
          ok = false
          details.push({ code: 'ATTRIBUTION_COLUMN_MISSING', message: `price_history.${column} ausente` })
        }
      } catch (err) {
        ok = false
        details.push({ code: 'ATTRIBUTION_SCHEMA_CHECK_FAILED', message: String(err) })
      }
    }
    return ok
  }

  private checkPrismaSchemaSync(details: AttributionPreflightFailure[]): boolean {
    try {
      const rootSchema = readFileSync(resolve(this.workspaceRoot, 'prisma/schema.prisma'), 'utf8')
      const nextSchema = readFileSync(resolve(this.workspaceRoot, 'footstock-next/prisma/schema.prisma'), 'utf8')
      const failures = comparePriceHistoryContract(rootSchema, nextSchema)
      for (const failure of failures) {
        details.push({ code: 'ATTRIBUTION_SCHEMA_DRIFT', message: failure })
      }
      return failures.length === 0
    } catch (err) {
      details.push({ code: 'ATTRIBUTION_SCHEMA_SYNC_FAILED', message: String(err) })
      return false
    }
  }

  private checkMetrics(details: AttributionPreflightFailure[]): boolean {
    const metrics = motorMetrics.assertRequiredRegistered()
    if (!metrics.ok) {
      details.push({ code: 'ATTRIBUTION_METRICS_MISSING', message: metrics.missing.join(',') })
    }
    return metrics.ok
  }

  private checkParserCanary(details: AttributionPreflightFailure[]): boolean {
    const attribution = buildPriceAttributionV2({
      tickId: 'preflight-parser-canary',
      tickCount: 1,
      tickStartedAt: new Date('2026-06-06T00:00:00.000Z'),
      tickEndedAt: new Date('2026-06-06T00:00:01.000Z'),
      previousPrice: 1,
      enginePrice: 1,
      finalPrice: 1,
      agentImpact: 0,
      syntheticVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      sessionType: 'TRADING',
      layerResults: [],
      generatedAt: new Date('2026-06-06T00:00:01.000Z'),
      qualityFlags: [],
    })
    const parsed = parsePriceAttribution(attribution)
    if (!parsed.ok) {
      details.push({ code: 'ATTRIBUTION_PARSER_CANARY_FAILED', message: parsed.reason })
    }
    return parsed.ok
  }

  private async checkTransactionalCanary(details: AttributionPreflightFailure[]): Promise<boolean> {
    try {
      const assetRows = await this.prisma.$queryRawUnsafe('SELECT id FROM assets LIMIT 1') as AssetIdRow[]
      const assetId = assetRows[0]?.id
      if (!assetId) {
        details.push({ code: 'ATTRIBUTION_CANARY_ASSET_MISSING', message: 'Nenhum asset disponivel para escrita canario transacional' })
        return false
      }

      const sessionType = await this.pickSessionType()
      const now = new Date()
      const attribution = buildPriceAttributionV2({
        tickId: `preflight-db-canary:${now.getTime()}`,
        tickCount: 1,
        tickStartedAt: now,
        tickEndedAt: now,
        previousPrice: 1,
        enginePrice: 1,
        finalPrice: 1,
        agentImpact: 0,
        syntheticVolume: 0,
        pendingBuyVolume: 0,
        pendingSellVolume: 0,
        sessionType: sessionType as SessionType,
        layerResults: [],
        generatedAt: now,
        qualityFlags: [],
      })
      const canaryId = `preflight_${now.getTime()}_${Math.random().toString(36).slice(2)}`

      try {
        await this.prisma.$transaction(async (tx: unknown) => {
          const client = tx as PrismaClient
          await client.$executeRawUnsafe(
            `
              INSERT INTO price_history
                (id, asset_id, timestamp, open, high, low, close, volume, session_type, source, attribution)
              VALUES
                ($1, $2, $3, 1, 1, 1, 1, 0, $4::"SessionType", 'MOTOR', $5::jsonb)
            `,
            canaryId,
            assetId,
            now,
            sessionType,
            JSON.stringify(attribution)
          )
          const rows = await client.$queryRawUnsafe(
            'SELECT attribution FROM price_history WHERE id = $1',
            canaryId
          ) as AttributionRow[]
          const parsed = parsePriceAttribution(rows[0]?.attribution)
          if (!parsed.ok) {
            throw new Error(`parser-readback-failed:${parsed.reason}`)
          }
          throw CANARY_ROLLBACK
        })
      } catch (err) {
        if (err === CANARY_ROLLBACK) return true
        throw err
      }

      return true
    } catch (err) {
      details.push({ code: 'ATTRIBUTION_TRANSACTIONAL_CANARY_FAILED', message: String(err) })
      return false
    }
  }

  private async pickSessionType(): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE typname = 'SessionType'
      ORDER BY enumsortorder
    `) as EnumLabelRow[]
    const labels = rows.map((row) => row.enumlabel)
    return labels.find((label) => label === 'TRADING')
      ?? labels.find((label) => label === 'REGULAR')
      ?? labels[0]
      ?? 'TRADING'
  }
}
