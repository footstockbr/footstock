// ============================================================================
// Foot Stock — GET /api/v1/admin/engagement/cohort
// Análise de coorte semanal: retenção de usuários novos por semana.
// Cache Redis 1h. Requer: engagement:read.
// Rastreabilidade: INT-088, TASK-4/ST003
// ============================================================================

import { NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'
import type { CohortWeek } from '@/lib/types/admin'

const CACHE_KEY = 'admin:cohort:cache'
const CACHE_TTL = 3600 // 1 hora

function weekStart(weeksAgo: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay() - weeksAgo * 7)
  return d
}

export const GET = withAdmin('engagement:read')(async () => {
  try {
    const cached = await redisPublisher.get(CACHE_KEY)
    if (cached) return NextResponse.json({ data: JSON.parse(cached) })
  } catch { /* ignora */ }

  const since = weekStart(4)

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since } },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const firstOrderByUser = new Map<string, Date>()
  for (const order of orders) {
    if (!firstOrderByUser.has(order.userId)) {
      firstOrderByUser.set(order.userId, order.createdAt)
    }
  }

  const cohorts: CohortWeek[] = []
  for (let w = 3; w >= 0; w--) {
    const wStart = weekStart(w)
    const wEnd = weekStart(w - 1)
    const weekLabel = `Sem ${4 - w} (${wStart.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })})`

    const cohortUsers = Array.from(firstOrderByUser.entries())
      .filter(([, d]) => d >= wStart && d < wEnd)
      .map(([userId]) => userId)

    const newUsers = cohortUsers.length
    if (newUsers === 0) {
      cohorts.push({ weekLabel, newUsers: 0, week1: 0, week2: 0, week3: 0, week4: 0 })
      continue
    }

    const cohortSet = new Set(cohortUsers)
    const weekSets: [Set<string>, Set<string>, Set<string>, Set<string>] = [
      new Set(), new Set(), new Set(), new Set(),
    ]

    for (const order of orders) {
      if (!cohortSet.has(order.userId)) continue
      const diff = Math.floor(
        (order.createdAt.getTime() - wStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
      )
      if (diff >= 0 && diff < 4) weekSets[diff]!.add(order.userId)
    }

    cohorts.push({
      weekLabel,
      newUsers,
      week1: Math.round((weekSets[0].size / newUsers) * 100),
      week2: Math.round((weekSets[1].size / newUsers) * 100),
      week3: Math.round((weekSets[2].size / newUsers) * 100),
      week4: Math.round((weekSets[3].size / newUsers) * 100),
    })
  }

  try {
    await redisPublisher.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(cohorts))
  } catch { /* ignora */ }

  return NextResponse.json({ data: cohorts })
})
