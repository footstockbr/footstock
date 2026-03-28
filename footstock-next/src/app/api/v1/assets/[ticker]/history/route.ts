import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { list, errors } from '@/lib/api'

const VALID_PERIODS = ['1m', '5m', '15m', '1h', '1d'] as const
type Period = (typeof VALID_PERIODS)[number]

// GET /api/v1/assets/:ticker/history?period=1h&limit=100&before=ISO8601
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const { searchParams } = request.nextUrl

  const period = searchParams.get('period') as Period | null
  const limitParam = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10)))
  const before = searchParams.get('before')

  if (!period || !VALID_PERIODS.includes(period)) {
    return errors.validation('Período inválido. Use: 1m, 5m, 15m, 1h, 1d')
  }

  try {
    const asset = await prisma.asset.findUnique({ where: { ticker: ticker.toUpperCase() } })
    if (!asset) return errors.notFound('Ativo não encontrado.')

    // TODO: Implementar via /auto-flow execute
    // Verificar plano do usuário para acesso a histórico granular (Craque/Lenda)
    const candles = await prisma.priceHistory.findMany({
      where: {
        ticker: ticker.toUpperCase(),
        period,
        ...(before && { timestamp: { lt: new Date(before) } }),
      },
      orderBy: { timestamp: 'desc' },
      take: limitParam,
    })

    const total = await prisma.priceHistory.count({
      where: { ticker: ticker.toUpperCase(), period },
    })

    const serialized = candles.map((c) => ({
      id: c.id,
      ticker: c.ticker,
      open: c.open.toNumber(),
      high: c.high.toNumber(),
      low: c.low.toNumber(),
      close: c.close.toNumber(),
      volume: c.volume.toNumber(),
      period: c.period as Period,
      timestamp: c.timestamp.toISOString(),
    }))

    return list(serialized, {
      page: 1,
      limit: limitParam,
      total,
      hasNext: candles.length === limitParam,
    })
  } catch {
    return errors.server()
  }
}
