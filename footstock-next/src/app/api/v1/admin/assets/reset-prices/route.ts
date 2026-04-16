// ============================================================================
// FootStock — POST /api/v1/admin/assets/reset-prices
// SuperAdmin: reseta precos de todos os ativos para valores da documentacao
// com pequena variacao aleatoria (+/- 5%).
//
// Body (opcional): { "dryRun": true }
// Retorna lista de alteracoes (ticker, oldPrice, newPrice, etc.)
// ============================================================================

import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { Division } from '@prisma/client'

// ─── Price calculation (mirrors prisma/seed/assets.ts) ──────────────────────

interface ClubSeedData {
  ticker: string
  division: Division
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

function applyVariation(price: number): number {
  const variation = Math.random() * 0.1 - 0.05 // -5% to +5%
  const adjusted = price * (1 + variation)
  return Math.max(1.0, Math.min(50.0, parseFloat(adjusted.toFixed(8))))
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

function buildAllClubData(): ClubSeedData[] {
  const serieA = SERIE_A_TICKERS.map((ticker, i) => toSerieASeed(i, ticker))
  const serieB = SERIE_B_TICKERS.map((ticker, i) => toSerieBSeed(i, ticker))
  return [...serieA, ...serieB]
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  // Apenas SuperAdmin pode resetar precos
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return errors.forbidden('Apenas SuperAdmin pode resetar precos de ativos.')
  }

  const body = await request.json().catch(() => ({}))
  const dryRun = body?.dryRun === true

  try {
    const allClubs = buildAllClubData()

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

    // Prepare changes
    const changes: Array<{
      ticker: string
      division: string
      oldPrice: number
      newPrice: number
      basePrice: number
      variationPct: number
      oldMarketCap: number
      newMarketCap: number
    }> = []

    for (const club of allClubs) {
      const existing = assetMap.get(club.ticker)
      if (!existing) continue

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

    if (!dryRun) {
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

      // Audit trail
      await prisma.adminMarketAction.create({
        data: {
          adminId: auth.user.id,
          action: 'RESET_PRICES',
          reason: 'Reset all asset prices to documentation values with random variation',
          details: {
            assetsUpdated: changes.length,
            executedBy: auth.user.email,
            executedAt: new Date().toISOString(),
          },
        },
      })
    }

    return ok({
      dryRun,
      assetsUpdated: changes.length,
      changes: changes.map((c) => ({
        ticker: c.ticker,
        division: c.division,
        oldPrice: c.oldPrice,
        newPrice: parseFloat(c.newPrice.toFixed(8)),
        basePrice: c.basePrice,
        variationPct: c.variationPct,
        oldMarketCap: c.oldMarketCap,
        newMarketCap: c.newMarketCap,
      })),
    })
  } catch (err) {
    console.error('[admin/assets/reset-prices] Error:', err)
    return errors.server()
  }
}
