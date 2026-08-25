import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const [user, positions, todayTransactions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { fsBalance: true, marginBlocked: true },
      }),
      prisma.position.findMany({
        where: { userId: auth.user.id, status: 'OPEN' },
        include: {
          asset: {
            select: { currentPrice: true, ticker: true, displayName: true },
          },
        },
      }),
      prisma.transaction.findMany({
        where: {
          userId: auth.user.id,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ])

    const balance = user?.fsBalance.toNumber() ?? 0
    const positionsValue = positions.reduce(
      (sum, p) => sum + p.quantity * p.asset.currentPrice.toNumber(),
      0,
    )
    const totalInvested = positions.reduce(
      (sum, p) => sum + p.totalInvested.toNumber(),
      0,
    )
    const pnl = positionsValue - totalInvested

    // pnlToday: soma do realizedPnl das transacoes TRADE do dia.
    // TRADE sem realizedPnl persistido fica FORA da soma (nunca zero silencioso)
    // e e contado em pnlTodayUnavailableCount.
    let pnlToday = 0
    let pnlTodayUnavailableCount = 0
    for (const t of todayTransactions) {
      if (t.financialType !== 'TRADE') continue
      const rpnl = t.realizedPnl?.toNumber() ?? null
      if (rpnl !== null) {
        pnlToday += rpnl
      } else {
        pnlTodayUnavailableCount++
      }
    }
    pnlToday = Math.round(pnlToday * 100) / 100

    return ok({
      balance,
      positionsValue,
      totalValue: balance + positionsValue,
      pnl,
      pnlToday,
      pnlTodayUnavailableCount,
      todayTransactionsCount: todayTransactions.length,
      positions: positions.map((p) => ({
        ticker: p.asset.ticker,
        displayName: p.asset.displayName,
        quantity: p.quantity,
        avgPrice: p.avgPrice.toNumber(),
        currentPrice: p.asset.currentPrice.toNumber(),
        totalInvested: p.totalInvested.toNumber(),
        side: p.side,
      })),
    })
  } catch {
    return errors.server()
  }
}
