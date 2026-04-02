// ============================================================================
// Foot Stock — Job: acúmulo de juros diário sobre posições SHORT abertas
// Executado diariamente às 00:00 BRT pelo scheduler (lib/jobs/scheduler.ts).
// Rastreabilidade: INT-014 / TASK-4/ST002
// ============================================================================

import { prisma } from '@/lib/prisma'
import { shortService } from '@/lib/services/ShortService'

export interface AccrualResult {
  processed: number
  totalInterest: number
  processedAt: Date
  errors: number
}

// Lotes paralelos para evitar timeout no Vercel (maxDuration: 30s)
// e manter conexões abaixo do pool_size do pgBouncer
const BATCH_SIZE = 10

export async function processInterestAccrual(): Promise<AccrualResult> {
  const openShorts = await prisma.position.findMany({
    where: { side: 'SHORT', status: 'OPEN' },
    select: { id: true },
  })

  if (openShorts.length === 0) {
    return { processed: 0, totalInterest: 0, processedAt: new Date(), errors: 0 }
  }

  let processed = 0
  let totalInterest = 0
  let errors = 0

  for (let i = 0; i < openShorts.length; i += BATCH_SIZE) {
    const batch = openShorts.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(({ id }) => shortService.accrueInterest(id))
    )

    results.forEach((r, j) => {
      if (r.status === 'fulfilled') {
        if (r.value > 0) {
          processed++
          totalInterest += r.value
        }
      } else {
        errors++
        console.error(`[interest-accrual] Falha ao cobrar juros positionId=${batch[j]?.id}:`, r.reason)
      }
    })
  }

  const result: AccrualResult = { processed, totalInterest, processedAt: new Date(), errors }
  console.info(`[interest-accrual] ${JSON.stringify(result)}`)
  return result
}

export default processInterestAccrual
