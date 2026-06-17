// ============================================================================
// FootStock Motor — Cron Scheduler (node-cron)
// 23 jobs migrados do Vercel (item 012 + item 026 P1-01).
// Scheduler é OPT-IN via env MOTOR_SCHEDULER_ENABLED.
// Apenas o leader executa jobs (gating via LeaderElection).
// ============================================================================

import cron from 'node-cron'
import { logger } from '../utils/logger'
import type { LeaderElection } from '../leader/LeaderElection'

// ─── Jobs (stubs — lógica a migrar de footstock-next/src/app/api/cron/*) ───
import { subscriptionExpiryJob } from './jobs/subscriptionExpiry'
import { bonusCreditJob } from './jobs/bonusCredit'
import { cancellationLockJob } from './jobs/cancellationLock'
import { dunningJob } from './jobs/dunning'
import { dataRetentionJob } from './jobs/dataRetention'
import { orderExpiryJob } from './jobs/orderExpiry'
import { interestAccrualJob } from './jobs/interestAccrual'
import { leverageInterestJob } from './jobs/leverageInterest'
import { monthlyDividendsJob } from './jobs/monthlyDividends'
import { expireDividendsJob } from './jobs/expireDividends'
import { creditDividendsJob } from './jobs/creditDividends'
import { scoringJob } from './jobs/scoring'
import { nsmJob } from './jobs/nsm'
import { moderationCleanupJob } from './jobs/moderationCleanup'
import { affiliateCommissionJob } from './jobs/affiliateCommission'
import { notificationDigestJob } from './jobs/notificationDigest'
import { notificationQueueJob } from './jobs/notificationQueue'
import { notificationTtlCleanupJob } from './jobs/notificationTtlCleanup'
import { ageVerificationRetryJob } from './jobs/ageVerificationRetry'
import { cancellationExpiryJob } from './jobs/cancellationExpiry'
import { cardUpdaterJob } from './jobs/cardUpdater'
import { financialDividendJob } from './jobs/financialDividend'
import { sessionTransitionJob } from './jobs/sessionTransition'
import { reconcilePaymentsJob } from './jobs/reconcilePayments'
import { classifyNewsSentimentJob } from './jobs/classifyNewsSentiment'

interface Job {
  name: string
  cron: string
  handler: () => void | Promise<void>
}

const jobs: Job[] = []

export function registerJob(
  name: string,
  cronExpression: string,
  handler: () => void | Promise<void>
): void {
  jobs.push({ name, cron: cronExpression, handler })
  logger.info(`[scheduler] Job registrado: ${name} (${cronExpression})`)
}

/**
 * Registra os jobs do scheduler (23 migrados do Vercel + reconcile-payments do item 12).
 * Deve ser chamada antes de startScheduler().
 */
export function registerAllJobs(): void {
  registerJob('subscription-expiry', '0 2 * * *', subscriptionExpiryJob)
  registerJob('bonus-credit', '0 3 * * *', bonusCreditJob)
  registerJob('cancellation-lock', '0 1 * * *', cancellationLockJob)
  registerJob('dunning', '0 4 * * *', dunningJob)
  registerJob('data-retention', '0 5 * * *', dataRetentionJob)
  registerJob('order-expiry', '0 6 * * *', orderExpiryJob)
  registerJob('interest-accrual', '0 7 * * *', interestAccrualJob)
  registerJob('leverage-interest', '30 7 * * *', leverageInterestJob)
  registerJob('monthly-dividends', '0 9 1 * *', monthlyDividendsJob)
  registerJob('expire-dividends', '0 8 * * *', expireDividendsJob)
  registerJob('credit-dividends', '0 9 * * *', creditDividendsJob)
  registerJob('scoring', '0 5 * * *', scoringJob)
  registerJob('nsm', '0 23 * * *', nsmJob)
  registerJob('moderation-cleanup', '0 3 * * *', moderationCleanupJob)
  registerJob('affiliate-commission', '0 6 * * *', affiliateCommissionJob)
  registerJob('notification-digest', '0 10 * * *', notificationDigestJob)
  registerJob('notification-queue', '0 10 * * *', notificationQueueJob)
  registerJob('notification-ttl-cleanup', '0 4 * * *', notificationTtlCleanupJob)
  registerJob('age-verification-retry', '0 6 * * *', ageVerificationRetryJob)
  registerJob('cancellation-expiry', '0 5 * * *', cancellationExpiryJob)
  registerJob('card-updater', '0 8 * * *', cardUpdaterJob)
  registerJob('financial-dividend', '0 5 1-7 * *', financialDividendJob)
  registerJob('session-transition', '* * * * *', sessionTransitionJob)
  // Item 12: recuperacao de pagamento aprovado sem ativacao (webhook perdido). A cada 6h.
  registerJob('reconcile-payments', '0 */6 * * *', reconcilePaymentsJob)
  // Item 15: classificacao de sentimento das noticias via LLM (forward + backfill). A cada 15min.
  registerJob('classify-news-sentiment', '*/15 * * * *', classifyNewsSentimentJob)
}

/**
 * Inicia o scheduler, agendando todos os jobs registrados.
 * Cada job verifica leader election antes de executar.
 */
export function startScheduler(leaderElection: LeaderElection): void {
  if (jobs.length === 0) {
    logger.info('[scheduler] Nenhum job registrado — scheduler idle.')
    return
  }

  for (const job of jobs) {
    cron.schedule(job.cron, async () => {
      if (!leaderElection.isLeader) {
        logger.debug(`[scheduler] Job ${job.name} skipped — não sou líder.`)
        return
      }
      try {
        logger.info(`[scheduler] Executando job: ${job.name}`)
        await job.handler()
      } catch (err) {
        logger.error(
          `[scheduler] Erro no job ${job.name}:`,
          err instanceof Error ? err.message : err
        )
      }
    })
  }

  logger.info(`[scheduler] Scheduler iniciado com ${jobs.length} job(s).`)
}
