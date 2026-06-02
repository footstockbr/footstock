// ============================================================================
// FootStock — Reset Asset Prices to Documentation Values
//
// Uso: npx tsx prisma/scripts/reset-prices-production.ts
//      npx tsx prisma/scripts/reset-prices-production.ts --dry-run
//
// SEGURANCA: script read-write que PODE rodar em producao.
// Reseta currentPrice, openPrice, closePrice e marketCap para valores
// calculados pela formula documentada (calcPrice) com pequena variacao
// aleatoria de +/- 5%.
// ============================================================================

import { PrismaClient, type Division } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

// ─── Prisma client (standalone, sem server-only) ────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ─── Club seed data types ───────────────────────────────────────────────────

interface ClubSeedData {
  ticker: string
  division: Division
  fanbaseMillion: number
  nationalTitles: number
  recentPerformance: number
}

// ─── Price formula (identical to prisma/seed/assets.ts) ─────────────────────

function calcPrice(data: ClubSeedData): number {
  const raw =
    data.fanbaseMillion * 0.5 +
    data.nationalTitles * 2 +
    data.recentPerformance * 0.3
  return Math.max(1.0, Math.min(50.0, parseFloat(raw.toFixed(2))))
}

// ─── Cluster helpers (identical to seed) ────────────────────────────────────

function getSerieACluster(index: number): string {
  if (index < 6) return 'A_TOP'
  if (index < 13) return 'A_MID'
  return 'A_SMALL'
}

function getSerieBCluster(index: number): string {
  return index < 6 ? 'B_LIQUID' : 'B_ILLIQ'
}

// ─── Seed data builders (identical to seed) ─────────────────────────────────

function toSerieASeed(index: number, ticker: string): ClubSeedData {
  return {
    ticker,
    division: 'SERIE_A',
    fanbaseMillion: Math.max(2, 18 - index * 0.6),
    nationalTitles: Math.max(0, 6 - Math.floor(index / 4)),
    recentPerformance: Math.max(4, 8.5 - (index % 6) * 0.5),
  }
}

function toSerieBSeed(index: number, ticker: string): ClubSeedData {
  return {
    ticker,
    division: 'SERIE_B',
    fanbaseMillion: Math.max(0.8, 6 - index * 0.2),
    nationalTitles: Math.max(0, 2 - Math.floor(index / 7)),
    recentPerformance: Math.max(3, 6.5 - (index % 6) * 0.4),
  }
}

// ─── Club tickers in order (must match CLUBS array in clubs.ts) ─────────────

const SERIE_A_TICKERS = [
  'URU3', 'POR4', 'TIM3', 'TRI4', 'GAL3', 'IMO3', 'COL3', 'GUE4',
  'BAL4', 'MAL4', 'FOG3', 'FUR3', 'FOR3', 'TRI3', 'RAP3', 'RBB3',
  'CUI3', 'VIT3', 'JUV3', 'MIR3',
]

const SERIE_B_TICKERS = [
  'LEI3', 'NTL3', 'AVA3', 'GOI3', 'CHA3', 'PON3', 'GUA3', 'OPE3',
  'SAM3', 'TIS3', 'LON3', 'FIG3', 'PAY3', 'CFC3', 'AME3', 'BSA3',
  'CRB3', 'CSA3', 'ITA3', 'TON3',
]

// ─── Build seed data for all clubs ──────────────────────────────────────────

function buildAllClubData(): ClubSeedData[] {
  const serieA = SERIE_A_TICKERS.map((ticker, i) => toSerieASeed(i, ticker))
  const serieB = SERIE_B_TICKERS.map((ticker, i) => toSerieBSeed(i, ticker))
  return [...serieA, ...serieB]
}

// ─── Random variation (+/- 5%) ──────────────────────────────────────────────

function applyVariation(price: number): number {
  const variation = Math.random() * 0.1 - 0.05 // -5% to +5%
  const adjusted = price * (1 + variation)
  return Math.max(1.0, Math.min(50.0, parseFloat(adjusted.toFixed(8))))
}

// ─── Core reset logic (exported for API reuse) ──────────────────────────────

export interface PriceChange {
  ticker: string
  division: string
  oldPrice: number
  newPrice: number
  basePrice: number
  variationPct: number
  oldMarketCap: number
  newMarketCap: number
}

export async function resetPrices(dryRun: boolean): Promise<PriceChange[]> {
  const allClubs = buildAllClubData()
  const changes: PriceChange[] = []

  // Fetch current assets
  const existingAssets = await prisma.asset.findMany({
    where: { ticker: { in: allClubs.map((c) => c.ticker) } },
    select: {
      ticker: true,
      division: true,
      currentPrice: true,
      marketCap: true,
      currentSupply: true,
    },
  })

  const assetMap = new Map(existingAssets.map((a) => [a.ticker, a]))

  // Prepare updates
  for (const club of allClubs) {
    const existing = assetMap.get(club.ticker)
    if (!existing) {
      console.warn(`[SKIP] Asset ${club.ticker} not found in database`)
      continue
    }

    const basePrice = calcPrice(club)
    const newPrice = applyVariation(basePrice)
    const oldPrice = existing.currentPrice.toNumber()
    const currentSupply = Number(existing.currentSupply)
    const newMarketCap = parseFloat((newPrice * currentSupply).toFixed(2))
    const variationPct = basePrice > 0
      ? parseFloat((((newPrice - basePrice) / basePrice) * 100).toFixed(2))
      : 0

    changes.push({
      ticker: club.ticker,
      division: club.division,
      oldPrice,
      newPrice,
      basePrice,
      variationPct,
      oldMarketCap: existing.marketCap.toNumber(),
      newMarketCap,
    })
  }

  if (dryRun) {
    return changes
  }

  // Execute in transaction
  await prisma.$transaction(
    changes.map((change) =>
      prisma.asset.update({
        where: { ticker: change.ticker },
        data: {
          currentPrice: change.newPrice,
          openPrice: change.newPrice,
          closePrice: change.newPrice,
          fairValue: change.basePrice,
          marketCap: change.newMarketCap,
        },
      })
    )
  )

  return changes
}

// ─── CLI entry point ────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  console.log('='.repeat(72))
  console.log('  FootStock — Reset Asset Prices to Documentation Values')
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no changes will be written)' : 'LIVE (writing to database)'}`)
  console.log(`  Database: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, '//***@') ?? 'NOT SET'}`)
  console.log('='.repeat(72))
  console.log()

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Aborting.')
    process.exit(1)
  }

  const changes = await resetPrices(dryRun)

  if (changes.length === 0) {
    console.log('No assets found in database. Nothing to update.')
    return
  }

  // Print summary table
  const header = [
    'Ticker'.padEnd(8),
    'Division'.padEnd(10),
    'Old Price'.padStart(12),
    'Base Price'.padStart(12),
    'New Price'.padStart(12),
    'Var%'.padStart(8),
  ].join(' | ')

  console.log(header)
  console.log('-'.repeat(header.length))

  for (const c of changes) {
    console.log([
      c.ticker.padEnd(8),
      c.division.padEnd(10),
      c.oldPrice.toFixed(2).padStart(12),
      c.basePrice.toFixed(2).padStart(12),
      c.newPrice.toFixed(2).padStart(12),
      `${c.variationPct > 0 ? '+' : ''}${c.variationPct.toFixed(2)}%`.padStart(8),
    ].join(' | '))
  }

  console.log('-'.repeat(header.length))
  console.log()
  console.log(`Total: ${changes.length} assets ${dryRun ? 'would be updated' : 'updated'}.`)

  if (dryRun) {
    console.log()
    console.log('This was a dry run. Run without --dry-run to apply changes.')
  }
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
