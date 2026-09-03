// ============================================================================
// FootStock Motor — Cron Job: session-transition
// Schedule: * * * * * (a cada minuto — verifica transição de sessão de mercado)
//
// Migrado de footstock-next/src/app/api/cron/session-transition/route.ts, que era
// órfã (nada a agendava: este repo não tem vercel.json) e foi REMOVIDA junto com
// esta implementação — dois escritores duplicariam cada transição.
//
// A lógica vive em services/cron/session-transition.ts; aqui só ficam a
// construção preguiçosa dos clientes e o contrato do scheduler (não lançar).
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { RedisClientService } from '../../services/RedisClientService'
import { runSessionTransition } from '../../services/cron/session-transition'
import { logger } from '../../utils/logger'

let _prisma: PrismaClient | null = null

export async function sessionTransitionJob(): Promise<void> {
  try {
    if (!_prisma) _prisma = new PrismaClient()
    const redis = await RedisClientService.getInstance()
    await runSessionTransition({ prisma: _prisma, redis })
  } catch (err) {
    // O scheduler captura, mas um job de auditoria nunca deve derrubar o motor.
    logger.error(`[cron/session-transition] Erro fatal no job: ${(err as Error).message}`)
  }
}
