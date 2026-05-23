// ============================================================================
// FootStock — GET /api/v1/portfolio/history?period=
// Histórico de evolução do patrimônio com dados REAIS + LOCF (module-15 — ST004).
// Rastreabilidade: INT-024
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PERIOD_DAYS: Record<string, number> = {
  '1H': 1, '12H': 1, '24H': 1, '7D': 7, '30D': 30, '1Y': 365, 'ALL': 365,
}

function toDate(d: Date): string {
  return d.toISOString().split('T')[0]!
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH-010', message: 'Sessão expirada.' } },
      { status: 401 }
    )
  }
  const userId = auth.user.id

  const period = req.nextUrl.searchParams.get('period') ?? '7D'
  const days = PERIOD_DAYS[period] ?? 7

  const startDate = new Date()
  startDate.setUTCDate(startDate.getUTCDate() - days)
  startDate.setUTCHours(0, 0, 0, 0)

  try {
    const positions = await prisma.position.findMany({
      where: { userId },
      select: {
        assetId: true, quantity: true, avgPrice: true,
        openedAt: true, createdAt: true, status: true, updatedAt: true,
      },
    })

    if (positions.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const assetIds = [...new Set(positions.map(p => p.assetId))]

    // Uma única query para todo o price_history do período
    const histories = await prisma.priceHistory.findMany({
      where: { assetId: { in: assetIds }, timestamp: { gte: startDate } },
      orderBy: { timestamp: 'asc' },
      select: { assetId: true, timestamp: true, close: true },
    })

    // price map: assetId → dateStr → price
    const priceMap = new Map<string, Map<string, number>>()
    for (const h of histories) {
      const d = toDate(h.timestamp)
      if (!priceMap.has(h.assetId)) priceMap.set(h.assetId, new Map())
      priceMap.get(h.assetId)!.set(d, parseFloat(String(h.close)))
    }

    // range de datas
    const dates: string[] = []
    const now = new Date()
    now.setUTCHours(0, 0, 0, 0)
    const cur = new Date(startDate)
    while (cur <= now) {
      dates.push(toDate(cur))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }

    const lastKnown = new Map<string, number>()
    const result: { date: string; totalValue: number }[] = []

    for (const dateStr of dates) {
      const date = new Date(dateStr + 'T00:00:00Z')
      let total = 0

      for (const pos of positions) {
        const opened = new Date(toDate(pos.openedAt ?? pos.createdAt) + 'T00:00:00Z')
        if (date < opened) continue
        if (pos.status === 'CLOSED') {
          const closed = new Date(toDate(pos.updatedAt) + 'T00:00:00Z')
          if (closed <= date) continue
        }

        let price = priceMap.get(pos.assetId)?.get(dateStr)
        if (price !== undefined) {
          lastKnown.set(pos.assetId, price)
        } else {
          price = lastKnown.get(pos.assetId) ?? parseFloat(String(pos.avgPrice))
        }
        total += Number(pos.quantity) * price
      }

      if (total > 0) result.push({ date: dateStr, totalValue: parseFloat(total.toFixed(2)) })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('[GET /api/v1/portfolio/history]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}
