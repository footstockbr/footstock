// ============================================================================
// FootStock Motor — Cron Job: reconcile-impact-dispatch (T-22 / item 023)
// Reconciliador de impacto não despachado: varre notícias com
// `impactDispatchedAt IS NULL` e reenvia o evento no Redis.
//
// Diferente dos reconciliadores reconcile-payments e reconcile-null-tickers,
// este job opera DIRETAMENTE no motor (não é proxy HTTP para footstock-next),
// porque os campos governados (impactDispatchedAt) vivem no schema do motor
// e o despacho é via Redis pub/sub (canal news:inject).
//
// Kill switch: IMPACT_RECONCILER_ENABLED=false desliga sem redeploy.
// Schedule: */5 * * * * (a cada 5 minutos).
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { RedisClientService } from '../../services/RedisClientService'
import { ImpactReconciler } from '../../news/impact-reconciler'
import { logger } from '../../utils/logger'

let _prisma: PrismaClient | null = null
let _instance: ImpactReconciler | null = null

async function getReconciler(): Promise<ImpactReconciler> {
  if (!_instance) {
    if (!_prisma) {
      _prisma = new PrismaClient()
    }
    const redis = await RedisClientService.getInstance()
    _instance = new ImpactReconciler(_prisma, redis)
  }
  return _instance
}

export async function reconcileImpactDispatchJob(): Promise<void> {
  try {
    const reconciler = await getReconciler()
    const result = await reconciler.run()
    if (result.status === 'disabled') {
      return // Kill switch ativo — skip silencioso (já logado pelo reconciliador).
    }
    if (result.status === 'error' && result.processed === 0) {
      logger.warn(JSON.stringify({
        event: 'reconcile_impact_dispatch_job_error',
        backlog: result.backlog,
        message: 'Ciclo do reconciliador terminou com erro e nenhum registro processado.',
      }))
    }
  } catch (err) {
    logger.error(`[reconcile-impact-dispatch] Erro fatal no job: ${(err as Error).message}`)
    // Não relançar — o scheduler captura e loga, mas não deve crashar o processo.
  }
}
