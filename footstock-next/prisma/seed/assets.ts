import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
import { CLUBS, CLUB_COLORS } from '@/lib/constants/clubs'
import type { Division } from '@prisma/client'

interface ClubSeedData {
  ticker: string
  displayName: string
  realName: string
  clubSlug: string
  division: Division
  cluster: string
  colorPrimary: string
  colorSecondary: string
  fanbaseMillion: number
  nationalTitles: number
  recentPerformance: number
}

function calcPrice(data: ClubSeedData): number {
  const raw =
    data.fanbaseMillion * 0.5 +
    data.nationalTitles * 2 +
    data.recentPerformance * 0.3
  return Math.max(1.0, Math.min(50.0, parseFloat(raw.toFixed(2))))
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function getSerieACluster(index: number): string {
  if (index < 6) return 'A_TOP'
  if (index < 13) return 'A_MID'
  return 'A_SMALL'
}

function getSerieBCluster(index: number): string {
  return index < 6 ? 'B_LIQUID' : 'B_ILLIQ'
}

function toSerieASeed(index: number, ticker: string, displayName: string, realName: string): ClubSeedData {
  const colors = CLUB_COLORS[ticker] ?? { primary: '#1a1a1a', secondary: '#ffffff' }
  return {
    ticker,
    displayName,
    realName,
    clubSlug: slugify(displayName),
    division: 'SERIE_A',
    cluster: getSerieACluster(index),
    colorPrimary: colors.primary,
    colorSecondary: colors.secondary,
    fanbaseMillion: Math.max(2, 18 - index * 0.6),
    nationalTitles: Math.max(0, 6 - Math.floor(index / 4)),
    recentPerformance: Math.max(4, 8.5 - (index % 6) * 0.5),
  }
}

function toSerieBSeed(index: number, ticker: string, displayName: string, realName: string): ClubSeedData {
  const colors = CLUB_COLORS[ticker] ?? { primary: '#334155', secondary: '#ffffff' }
  return {
    ticker,
    displayName,
    realName,
    clubSlug: slugify(displayName),
    division: 'SERIE_B',
    cluster: getSerieBCluster(index),
    colorPrimary: colors.primary,
    colorSecondary: colors.secondary,
    fanbaseMillion: Math.max(0.8, 6 - index * 0.2),
    nationalTitles: Math.max(0, 2 - Math.floor(index / 7)),
    recentPerformance: Math.max(3, 6.5 - (index % 6) * 0.4),
  }
}

const SERIE_A_CLUBS: ClubSeedData[] = CLUBS
  .filter((club) => club.division === 'SERIE_A')
  .map((club, index) => toSerieASeed(index, club.ticker, club.displayName, club.realName))

const SERIE_B_CLUBS: ClubSeedData[] = CLUBS
  .filter((club) => club.division === 'SERIE_B')
  .map((club, index) => toSerieBSeed(index, club.ticker, club.displayName, club.realName))

export async function seedAssets() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:assets] Seeds não executam em produção.')
  }

  const allClubs = [...SERIE_A_CLUBS, ...SERIE_B_CLUBS]
  const validTickers = allClubs.map((club) => club.ticker)

  await prisma.asset.deleteMany({
    where: { ticker: { notIn: validTickers } },
  })

  for (const club of allClubs) {
    const price = calcPrice(club)
    await prisma.asset.upsert({
      where: { ticker: club.ticker },
      create: {
        ticker: club.ticker,
        displayName: club.displayName,
        realName: club.realName,
        clubSlug: club.clubSlug,
        division: club.division,
        cluster: club.cluster,
        colorPrimary: club.colorPrimary,
        colorSecondary: club.colorSecondary,
        currentPrice: price,
        openPrice: price,
        closePrice: price,
        fairValue: price,
        marketCap: price * 1_000_000,
        volume: BigInt(0),
        isActive: true,
      },
      update: {
        displayName: club.displayName,
        realName: club.realName,
        clubSlug: club.clubSlug,
        division: club.division,
        cluster: club.cluster,
        colorPrimary: club.colorPrimary,
        colorSecondary: club.colorSecondary,
      },
    })
  }

  console.log(`[seed:assets] ${allClubs.length} ativos sincronizados.`)
}
