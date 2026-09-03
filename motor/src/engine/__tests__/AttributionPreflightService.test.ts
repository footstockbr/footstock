import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  AttributionPreflightService,
  comparePriceHistoryContract,
} from '../AttributionPreflightService'
import { motorMetrics } from '../../utils/logger'

const SYNCED_SCHEMA = `
enum SessionType {
  TRADING
  CLOSED
}

model PriceHistory {
  id          String      @id @default(cuid())
  assetId     String      @map("asset_id")
  sessionType SessionType @map("session_type")
  source      String      @default("REAL") @map("source")
  attribution Json?       @map("attribution") @db.JsonB
  @@map("price_history")
}

model MarketSessionLog {
  id            String      @id @default(cuid())
  fromSession   SessionType @map("from_session")
  toSession     SessionType @map("to_session")
  transitionAt  DateTime    @default(now()) @map("transition_at") @db.Timestamptz
  transitionDay String      @map("transition_day") @db.VarChar(10)
  @@unique([transitionDay, fromSession, toSession])
  @@map("market_session_logs")
}
`

describe('AttributionPreflightService', () => {
  it('detecta drift relevante entre schemas Prisma de PriceHistory/SessionType', () => {
    const drifted = SYNCED_SCHEMA.replace('TRADING', 'REGULAR')

    expect(comparePriceHistoryContract(SYNCED_SCHEMA, drifted)).toEqual([
      'enum SessionType divergente entre prisma/schema.prisma e footstock-next/prisma/schema.prisma',
    ])
  })

  // 09-02: MarketSessionLog entrou no guard depois de os dois schemas terem
  // divergido em nome de tabela e tipo de coluna por meses sem sinal nenhum.
  it('detecta drift no model MarketSessionLog', () => {
    const drifted = SYNCED_SCHEMA.replace('@@map("market_session_logs")', '@@map("market_session_log")')

    expect(comparePriceHistoryContract(SYNCED_SCHEMA, drifted)).toEqual([
      'model MarketSessionLog divergente entre prisma/schema.prisma e footstock-next/prisma/schema.prisma',
    ])
  })

  it('acusa ausencia do bloco em um dos schemas', () => {
    const semModel = SYNCED_SCHEMA.slice(0, SYNCED_SCHEMA.indexOf('model MarketSessionLog'))

    expect(comparePriceHistoryContract(SYNCED_SCHEMA, semModel)).toEqual([
      'model MarketSessionLog ausente em um dos schemas Prisma',
    ])
  })

  it('executa escrita canario transacional, relendo attribution v2 e revertendo rollback', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'attribution-preflight-'))
    mkdirSync(join(workspaceRoot, 'prisma'), { recursive: true })
    mkdirSync(join(workspaceRoot, 'footstock-next/prisma'), { recursive: true })
    writeFileSync(join(workspaceRoot, 'prisma/schema.prisma'), SYNCED_SCHEMA)
    writeFileSync(join(workspaceRoot, 'footstock-next/prisma/schema.prisma'), SYNCED_SCHEMA)

    let insertedAttribution: unknown = null
    const tx = {
      $executeRawUnsafe: jest.fn(async (_sql: string, ...args: unknown[]) => {
        insertedAttribution = JSON.parse(String(args[4]))
      }),
      $queryRawUnsafe: jest.fn(async () => [{ attribution: insertedAttribution }]),
    }
    const prisma = {
      $queryRawUnsafe: jest.fn(async (sql: string) => {
        if (sql.includes('information_schema.columns')) return [{ exists: true }]
        if (sql.includes('SELECT id FROM assets')) return [{ id: 'asset-1' }]
        if (sql.includes('FROM pg_enum')) return [{ enumlabel: 'TRADING' }]
        return []
      }),
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    }

    const result = await new AttributionPreflightService(prisma as never, workspaceRoot).run()

    expect(result.ok).toBe(true)
    expect(result.checks).toMatchObject({
      columns: true,
      schemaSync: true,
      metrics: true,
      parserCanary: true,
      transactionalCanary: true,
    })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('falha quando metrica obrigatoria nao esta registrada', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'attribution-preflight-metrics-'))
    mkdirSync(join(workspaceRoot, 'prisma'), { recursive: true })
    mkdirSync(join(workspaceRoot, 'footstock-next/prisma'), { recursive: true })
    writeFileSync(join(workspaceRoot, 'prisma/schema.prisma'), SYNCED_SCHEMA)
    writeFileSync(join(workspaceRoot, 'footstock-next/prisma/schema.prisma'), SYNCED_SCHEMA)

    const metricsSpy = jest
      .spyOn(motorMetrics, 'assertRequiredRegistered')
      .mockReturnValue({ ok: false, missing: ['motor_tick_duration_ms'] })

    const tx = {
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn(async () => [{ attribution: null }]),
    }
    const prisma = {
      $queryRawUnsafe: jest.fn(async (sql: string) => {
        if (sql.includes('information_schema.columns')) return [{ exists: true }]
        if (sql.includes('SELECT id FROM assets')) return []
        if (sql.includes('FROM pg_enum')) return [{ enumlabel: 'TRADING' }]
        return []
      }),
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    }

    const result = await new AttributionPreflightService(prisma as never, workspaceRoot).run()

    expect(result.ok).toBe(false)
    expect(result.failures).toContain('ATTRIBUTION_METRICS_MISSING: motor_tick_duration_ms')
    metricsSpy.mockRestore()
  })
})
