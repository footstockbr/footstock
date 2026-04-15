// ============================================================================
// Foot Stock — Job: juros diários sobre posições LONG alavancadas (2x)
// Executado diariamente às 07:30 BRT (após o interest-accrual das SHORT).
// Rastreabilidade: T-003 / INT-TRD-005
// ============================================================================

import { prisma } from '@/lib/prisma'
import { leverageService } from '@/lib/services/LeverageService'

export interface LeverageAccrualResult {
  processed: number
  totalInterest: number
  liquidated: number
  processedAt: Date
  errors: number
}

// Lotes paralelos para evitar timeout no Vercel (maxDuration: 30s)
const BATCH_SIZE = 10

export async function processLeverageInterest(): Promise<LeverageAccrualResult> {
  // Buscar posições LONG abertas com leverage > 1
  const leveragedPositions = await prisma.position.findMany({
    where: {
      side: 'LONG',
      status: 'OPEN',
      leverageMultiplier: { gt: 1 },
      leverageAmount: { gt: 0 },
    },
    select: { id: true },
  })

  if (leveragedPositions.length === 0) {
    return { processed: 0, totalInterest: 0, liquidated: 0, processedAt: new Date(), errors: 0 }
  }

  let processed = 0
  let totalInterest = 0
  let liquidated = 0
  let errors = 0

  for (let i = 0; i < leveragedPositions.length; i += BATCH_SIZE) {
    const batch = leveragedPositions.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(({ id }) => leverageService.accrueInterest(id))
    )

    results.forEach((r, j) => {
      if (r.status === 'fulfilled') {
        if (r.value.accrued) {
          processed++
          totalInterest += r.value.interest
        }
        if (r.value.liquidated) {
          liquidated++
        }
      } else {
        errors++
        console.error(
          `[leverage-interest] Falha ao processar positionId=${batch[j]?.id}:`,
          r.reason
        )
      }
    })
  }

  const result: LeverageAccrualResult = {
    processed,
    totalInterest,
    liquidated,
    processedAt: new Date(),
    errors,
  }

  console.info(`[leverage-interest] ${JSON.stringify(result)}`)
  return result
}

export default processLeverageInterest
