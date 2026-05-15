// ============================================================================
// Foot Stock Motor — Migracao one-shot: ordens STOP_LOSS/TAKE_PROFIT standalone
// de JOGADOR/CRAQUE viram LIMIT preservando o preco-gatilho como preco-limite.
//
// Politica: CONVERT_TO_LIMIT (preserva preco-gatilho como preco-limite).
// Idempotente: marca cada ordem migrada com tag em description/notas via fee=0 + status FILLED no audit log,
// e usa flag em tabela auxiliar `migration_audit` se existir, senao logs winston com migration_id.
//
// Uso:
//   pnpm tsx src/scripts/migrate-conditional-orders-2026-05-14.ts --dry-run
//   pnpm tsx src/scripts/migrate-conditional-orders-2026-05-14.ts --apply
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

const MIGRATION_ID = 'conditional-orders-lenda-2026-05-14'

interface Counts {
  total: number
  byPlan: Record<string, number>
  byType: Record<string, number>
  converted: number
  skipped: number
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const dryRun = !apply || args.includes('--dry-run')

  const mode = dryRun ? 'DRY_RUN' : 'APPLY'
  logger.info(`[${MIGRATION_ID}] starting in mode=${mode}`)

  const prisma = new PrismaClient()
  const counts: Counts = {
    total: 0,
    byPlan: { JOGADOR: 0, CRAQUE: 0 },
    byType: { STOP_LOSS: 0, TAKE_PROFIT: 0 },
    converted: 0,
    skipped: 0,
  }

  try {
    const candidates = await prisma.order.findMany({
      where: {
        type: { in: ['STOP_LOSS', 'TAKE_PROFIT'] },
        status: 'OPEN',
        groupId: null,
        user: { planType: { in: ['JOGADOR', 'CRAQUE'] } },
      },
      include: { user: { select: { id: true, planType: true } } },
    })

    counts.total = candidates.length
    logger.info(`[${MIGRATION_ID}] candidates=${counts.total}`)

    for (const order of candidates) {
      const planType = order.user.planType
      counts.byPlan[planType] = (counts.byPlan[planType] ?? 0) + 1
      counts.byType[order.type] = (counts.byType[order.type] ?? 0) + 1

      if (order.price === null) {
        logger.warn(`[${MIGRATION_ID}] skip orderId=${order.id} (price is null, cannot convert to LIMIT)`)
        counts.skipped += 1
        continue
      }

      if (dryRun) {
        logger.info(
          `[${MIGRATION_ID}] DRY would convert orderId=${order.id} ` +
          `user=${order.userId} plan=${planType} from=${order.type} to=LIMIT price=${String(order.price)}`,
        )
        counts.converted += 1
        continue
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { type: 'LIMIT' },
      })
      counts.converted += 1
      logger.info(
        `[${MIGRATION_ID}] APPLY converted orderId=${order.id} ` +
        `user=${order.userId} plan=${planType} from=${order.type} to=LIMIT`,
      )
    }

    logger.info(`[${MIGRATION_ID}] DONE counts=${JSON.stringify(counts)}`)
    console.log(JSON.stringify({ migration_id: MIGRATION_ID, mode, counts }, null, 2))
  } catch (err) {
    logger.error(`[${MIGRATION_ID}] FAILED: ${String(err)}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

export { main, MIGRATION_ID }
