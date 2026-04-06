import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { list, errors } from '@/lib/api'
import type { Division } from '@prisma/client'

// GET /api/v1/assets
// Nota: /api/v1/market/assets é o path legado — use /api/v1/assets
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const division = searchParams.get('division') as Division | null
  const sentiment = searchParams.get('sentiment') as string | null
  const isHalted = searchParams.get('isHalted')

  try {
    // TODO: Implementar via /auto-flow execute
    // Incluir lógica de delay de cotações para plano JOGADOR (60 min)
    const where = {
      ...(division && { division }),
      ...(sentiment && { sentiment }),
      ...(isHalted !== null && { isHalted: isHalted === 'true' }),
    }

    const assets = await prisma.asset.findMany({
      where,
      orderBy: [{ division: 'asc' }, { ticker: 'asc' }],
    })

    const serialized = assets.map((a) => ({
      id: a.id,
      ticker: a.ticker,
      displayName: a.name,
      division: a.division,
      currentPrice: a.currentPrice.toNumber(),
      fairValue: a.fairValue.toNumber(),
      currentSupply: Number(a.currentSupply),
      totalShares: Number(a.totalShares),
      isHalted: a.isHalted,
      haltReason: a.haltReason ?? null,
      colors: { primary: a.colorPrimary, secondary: a.colorSecondary },
      financials: a.financials,
      sentiment: a.sentiment,
      updatedAt: a.updatedAt.toISOString(),
    }))

    return list(serialized, {
      page: 1,
      limit: serialized.length,
      total: serialized.length,
      hasNext: false,
    })
  } catch {
    return errors.server()
  }
}
