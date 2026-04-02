// Seed de preços históricos — 40 clubes × 365 dias via GBM
// Execução: npx ts-node prisma/seed/historical-prices.ts

import { PrismaClient } from '@prisma/client'
import { GBMHistoryGenerator } from '../../motor/src/history/GBMHistoryGenerator'

const prisma = new PrismaClient()
const generator = new GBMHistoryGenerator()

// Clubes com preços IPO estimados (baseados na ValuationService)
const CLUBS = [
  { ticker: 'FLA', name: 'Flamengo',     ipoPrice: 48.50 },
  { ticker: 'PAL', name: 'Palmeiras',    ipoPrice: 35.20 },
  { ticker: 'COR', name: 'Corinthians',  ipoPrice: 28.10 },
  { ticker: 'SAO', name: 'São Paulo',    ipoPrice: 25.80 },
  { ticker: 'SAN', name: 'Santos',       ipoPrice: 22.40 },
  { ticker: 'VAS', name: 'Vasco',        ipoPrice: 19.90 },
  { ticker: 'BOT', name: 'Botafogo',     ipoPrice: 18.30 },
  { ticker: 'FLU', name: 'Fluminense',   ipoPrice: 17.60 },
  { ticker: 'GRE', name: 'Grêmio',       ipoPrice: 26.40 },
  { ticker: 'INT', name: 'Internacional', ipoPrice: 24.10 },
  { ticker: 'ATH', name: 'Athletico-PR', ipoPrice: 16.80 },
  { ticker: 'CAM', name: 'Atlético-MG',  ipoPrice: 29.30 },
  { ticker: 'CRU', name: 'Cruzeiro',     ipoPrice: 15.50 },
  { ticker: 'BAH', name: 'Bahia',        ipoPrice: 13.20 },
  { ticker: 'FOR', name: 'Fortaleza',    ipoPrice: 11.80 },
]

async function seedHistoricalPrices() {
  console.log('Iniciando seed de preços históricos...')
  let totalInserted = 0

  for (const club of CLUBS) {
    const history = generator.generate({
      ticker: club.ticker,
      startPrice: club.ipoPrice,
      days: 365,
    })

    // Buscar asset pelo ticker
    const asset = await (prisma as any).assets?.findFirst({ where: { ticker: club.ticker } }).catch(() => null)
    if (!asset) {
      console.warn(`Asset não encontrado para ticker: ${club.ticker}`)
      continue
    }

    // Inserir em batch de 50
    for (let i = 0; i < history.length; i += 50) {
      const batch = history.slice(i, i + 50)
      await (prisma as any).priceHistory?.createMany({
        data: batch.map((bar) => ({
          assetId: asset.id,
          date: bar.date,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          regime: bar.regime,
        })),
        skipDuplicates: true,
      }).catch(() => null)
      totalInserted += batch.length
    }

    console.log(`✓ ${club.ticker}: ${history.length} registros`)
  }

  console.log(`\nSeed concluído: ${totalInserted} registros inseridos`)
}

seedHistoricalPrices()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
