import { existsSync, readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type AssetRow = { id: string }
type ExplainRow = { 'QUERY PLAN'?: string; query_plan?: string }

function assertCondition(condition: boolean, message: string, failures: string[]): void {
  if (!condition) failures.push(message)
}

async function explainOrderSnapshot(assetIds: string[]): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<ExplainRow[]>(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT
      asset_id,
      COALESCE(SUM(CASE WHEN side = 'BUY' AND type <> 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS open_buy_qty,
      COALESCE(SUM(CASE WHEN side = 'SELL' AND type <> 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS open_sell_qty,
      COALESCE(SUM(CASE WHEN side = 'BUY' AND type = 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS market_buy_qty,
      COALESCE(SUM(CASE WHEN side = 'SELL' AND type = 'MARKET' THEN quantity ELSE 0 END), 0)::bigint AS market_sell_qty,
      COUNT(*)::bigint AS order_count
    FROM orders
    WHERE asset_id = ANY($1::text[])
      AND status IN ('OPEN', 'PARTIAL')
      AND type IN ('MARKET', 'LIMIT', 'OCO')
      AND quantity > 0
      AND created_at <= $2
      AND (expires_at IS NULL OR expires_at > $2)
      AND (price IS NULL OR price > 0)
    GROUP BY asset_id
  `, assetIds, new Date())

  return rows
    .map((row) => row['QUERY PLAN'] ?? row.query_plan)
    .filter((line): line is string => typeof line === 'string')
}

async function main() {
  const failures: string[] = []
  const baselinePath = 'blacksmith/value-analysis-causal-baseline.md'
  assertCondition(existsSync(baselinePath), 'Baseline causal ausente.', failures)
  if (existsSync(baselinePath)) {
    const baseline = readFileSync(baselinePath, 'utf8')
    assertCondition(baseline.includes('Resultado medido.'), 'Baseline existe, mas nao contem resultado medido.', failures)
    assertCondition(!baseline.includes('provisoria ate confirmacao'), 'Baseline ainda esta marcado como provisorio.', failures)
  }

  assertCondition(process.env.ATTRIBUTION_STRICT_MODE !== 'true', 'ATTRIBUTION_STRICT_MODE=true antes do gate final.', failures)
  assertCondition(process.env.ORDER_FLOW_SNAPSHOT_ENABLED !== 'true' || process.env.ORDER_FLOW_SNAPSHOT_ROLLBACK_TESTED === 'true', 'Snapshot ligado sem ORDER_FLOW_SNAPSHOT_ROLLBACK_TESTED=true.', failures)

  const assetRows = await prisma.$queryRawUnsafe<AssetRow[]>('SELECT id FROM assets WHERE is_active = true LIMIT 40')
  assertCondition(assetRows.length >= 40, `Carga de rollout exige 40 ativos; encontrados ${assetRows.length}.`, failures)

  const plan = assetRows.length > 0 ? await explainOrderSnapshot(assetRows.map((row) => row.id)) : []
  const joinedPlan = plan.join('\n')
  assertCondition(/GroupAggregate|HashAggregate/i.test(joinedPlan), 'EXPLAIN nao mostra agregacao por asset_id.', failures)
  assertCondition(/idx_orders_asset_status_side_type_created_at|Index Scan|Bitmap Index Scan/i.test(joinedPlan), 'EXPLAIN nao confirmou uso de indice para snapshot de ordens.', failures)

  const attributionSource = readFileSync('motor/src/engine/PriceAttribution.ts', 'utf8')
  assertCondition(/PII_KEY_PATTERN/.test(attributionSource), 'Sanitizacao de PII nao encontrada em PriceAttribution.', failures)
  assertCondition(/email\|nome\|name\|saldo\|balance\|ip\|session\|payload\|user/.test(attributionSource), 'Catalogo minimo de PII nao encontrado.', failures)

  const result = { ok: failures.length === 0, failures, explainPlan: plan }
  console.log(JSON.stringify(result, null, 2))
  if (failures.length > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(String(err))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
