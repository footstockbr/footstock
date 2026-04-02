import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { CohortWeek } from '@/lib/types/admin'

const CACHE_KEY = 'admin:cohort:cache'
const CACHE_TTL = 3600

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function weekStart(weeksAgo: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay() - weeksAgo * 7) // começo da semana (domingo)
  return d
}

// GET /api/v1/admin/engagement/cohort — Monitor+
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
      { status: 403 }
    )
  }

  const redis = getRedis()
  if (redis) {
    try {
      const cached = await redis.get<CohortWeek[]>(CACHE_KEY)
      if (cached) return ok(cached)
    } catch { /* ignora */ }
  }

  try {
    const since = weekStart(4) // 4 semanas atrás

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: since } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    // Identificar primeira ordem de cada usuário
    const firstOrderByUser = new Map<string, Date>()
    for (const order of orders) {
      if (!firstOrderByUser.has(order.userId)) {
        firstOrderByUser.set(order.userId, order.createdAt)
      }
    }

    // Agrupar por semana de primeira ordem
    const cohorts: CohortWeek[] = []
    for (let w = 3; w >= 0; w--) {
      const wStart = weekStart(w)
      const wEnd = weekStart(w - 1)
      const weekLabel = `Sem ${4 - w} (${wStart.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })})`

      // Novos usuários desta cohort
      const cohortUsers = Array.from(firstOrderByUser.entries())
        .filter(([, d]) => d >= wStart && d < wEnd)
        .map(([userId]) => userId)

      const newUsers = cohortUsers.length
      if (newUsers === 0) {
        cohorts.push({ weekLabel, newUsers: 0, week1: 0, week2: 0, week3: 0, week4: 0 })
        continue
      }

      const cohortSet = new Set(cohortUsers)

      // Ordens de usuários desta cohort nas semanas seguintes
      const activityByWeek: number[] = [0, 0, 0, 0]
      for (const order of orders) {
        if (!cohortSet.has(order.userId)) continue
        const diff = Math.floor(
          (order.createdAt.getTime() - wStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
        )
        if (diff >= 0 && diff < 4) {
          activityByWeek[diff]++
        }
      }

      // Unique users por semana
      const weekSets: Set<string>[] = [new Set(), new Set(), new Set(), new Set()]
      for (const order of orders) {
        if (!cohortSet.has(order.userId)) continue
        const diff = Math.floor(
          (order.createdAt.getTime() - wStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
        )
        if (diff >= 0 && diff < 4) weekSets[diff].add(order.userId)
      }

      cohorts.push({
        weekLabel,
        newUsers,
        week1: newUsers > 0 ? Math.round((weekSets[0].size / newUsers) * 100) : 0,
        week2: newUsers > 0 ? Math.round((weekSets[1].size / newUsers) * 100) : 0,
        week3: newUsers > 0 ? Math.round((weekSets[2].size / newUsers) * 100) : 0,
        week4: newUsers > 0 ? Math.round((weekSets[3].size / newUsers) * 100) : 0,
      })
    }

    if (redis) {
      try { await redis.set(CACHE_KEY, cohorts, { ex: CACHE_TTL }) } catch { /* ignora */ }
    }

    return ok(cohorts)
  } catch {
    return errors.server()
  }
}
