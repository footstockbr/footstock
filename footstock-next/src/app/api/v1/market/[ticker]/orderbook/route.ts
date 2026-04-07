// GET /api/v1/market/[ticker]/orderbook
// Snapshot do livro de ordens: LIMIT/STOP_LOSS/TAKE_PROFIT pendentes, agrupados por nível de preço.
import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { tickerSchema } from '@/lib/validators/tickerSchema'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { ticker: rawTicker } = await params
  const result = tickerSchema.safeParse(rawTicker)
  if (!result.success) return errors.notFound()
  const ticker = result.data

  try {
    const asset = await prisma.asset.findUnique({
      where: { ticker },
      select: { id: true, currentPrice: true, isHalted: true, haltReason: true },
    })
    if (!asset) return errors.notFound()

    const lastPrice = asset.currentPrice.toNumber()

    // Ordens pendentes com preço definido (LIMIT, STOP_LOSS, TAKE_PROFIT)
    const orders = await prisma.order.findMany({
      where: {
        assetId: asset.id,
        status: 'OPEN',
        type: { in: ['LIMIT', 'STOP_LOSS', 'TAKE_PROFIT'] },
        price: { not: null },
      },
      select: { side: true, quantity: true, price: true },
    })

    // Agrega por lado e nível de preço (arredondado em 2 casas)
    const bidMap = new Map<number, number>()
    const askMap = new Map<number, number>()

    for (const o of orders) {
      const p = parseFloat(o.price!.toNumber().toFixed(2))
      if (o.side === 'BUY') {
        bidMap.set(p, (bidMap.get(p) ?? 0) + o.quantity)
      } else {
        askMap.set(p, (askMap.get(p) ?? 0) + o.quantity)
      }
    }

    const bids = [...bidMap.entries()]
      .sort((a, b) => b[0] - a[0]) // decrescente
      .slice(0, 10)
      .map(([price, quantity]) => ({ price, quantity }))

    const asks = [...askMap.entries()]
      .sort((a, b) => a[0] - b[0]) // crescente
      .slice(0, 10)
      .map(([price, quantity]) => ({ price, quantity }))

    // Spread sintético (motor usa ±0.1%) para quando o livro está vazio
    const bestBid = bids[0]?.price ?? lastPrice * 0.999
    const bestAsk = asks[0]?.price ?? lastPrice * 1.001
    const spread = bestAsk - bestBid

    return ok({
      ticker,
      lastPrice,
      isHalted: asset.isHalted,
      haltReason: asset.haltReason ?? null,
      bids,
      asks,
      spread: parseFloat(spread.toFixed(8)),
      spreadPct: parseFloat(((spread / lastPrice) * 100).toFixed(4)),
      orderCount: orders.length,
    })
  } catch {
    return errors.server()
  }
}
