import { errors, ok } from '@/lib/api'
import { prisma } from '@/lib/prisma'

// GET /api/v1/assets/:ticker
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params

  try {
    const asset = await prisma.asset.findUnique({
      where: { ticker: ticker.toUpperCase() },
    })

    if (!asset) {
      return errors.notFound('Ativo não encontrado.')
    }

    return ok({
      id: asset.id,
      ticker: asset.ticker,
      displayName: asset.displayName,
      division: asset.division,
      currentPrice: asset.currentPrice.toNumber(),
      fairValue: asset.fairValue.toNumber(),
      currentSupply: Number(asset.currentSupply),
      totalShares: Number(asset.totalShares),
      isHalted: asset.isHalted,
      haltReason: asset.haltReason ?? null,
      colors: asset.colors as { primary: string; secondary: string },
      financials: asset.financials,
      sentiment: asset.sentiment,
      updatedAt: asset.updatedAt.toISOString(),
    })
  } catch {
    return errors.server()
  }
}
