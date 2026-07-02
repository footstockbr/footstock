// ============================================================================
// FootStock — Claim atômico de idempotência de webhook (PA-WH-01)
// Fecha a janela de concorrência do dedup por findFirst em webhook_audit_logs.
// Opt-in via WEBHOOK_ATOMIC_CLAIM=true; requer a migration M065 aplicada.
// ============================================================================

import { prisma } from '@/lib/prisma'
import type { SubscriptionGateway } from '@prisma/client'

// Janela de lease: uma claim PROCESSING mais antiga que isto é considerada abandonada
// (o processamento anterior morreu antes de marcar PROCESSED/FAILED) e pode ser
// re-reivindicada por um reenvio do provedor. Precisa ser > tempo típico de processamento
// do webhook e < intervalo de retry do gateway.
const LEASE_MS = 60_000

export type ClaimOutcome =
  | { outcome: 'CLAIMED'; id: string }
  | { outcome: 'DUPLICATE' }
  | { outcome: 'IN_PROGRESS' }

/**
 * Reivindica atomicamente o processamento de um evento de webhook.
 * Dois webhooks idênticos simultâneos disputam a MESMA linha unique
 * (gateway, eventType, transactionId): só um vence o create.
 *
 * - `CLAIMED`   → primeira reivindicação (ou re-claim de PROCESSING abandonado / FAILED). Prossiga.
 * - `DUPLICATE` → já PROCESSED. Responda 200 sem reprocessar.
 * - `IN_PROGRESS` → outro worker está processando dentro do lease. Responda 503 (retry).
 */
export async function claimWebhook(
  gateway: SubscriptionGateway,
  eventType: string,
  transactionId: string,
): Promise<ClaimOutcome> {
  try {
    const created = await prisma.webhookIdempotency.create({
      data: { gateway, eventType, transactionId, status: 'PROCESSING' },
      select: { id: true },
    })
    return { outcome: 'CLAIMED', id: created.id }
  } catch (err) {
    // P2002 = violação de unique → já existe uma linha para este evento.
    if ((err as { code?: string })?.code !== 'P2002') throw err

    const existing = await prisma.webhookIdempotency.findUnique({
      where: { gateway_eventType_transactionId: { gateway, eventType, transactionId } },
      select: { id: true, status: true, updatedAt: true },
    })
    // Corrida rara: a linha sumiu entre create e findUnique (ex.: cleanup concorrente).
    if (!existing) return { outcome: 'IN_PROGRESS' }

    if (existing.status === 'PROCESSED') return { outcome: 'DUPLICATE' }

    // PROCESSING abandonado (lease expirado) ou FAILED → re-reivindicar.
    const leaseExpired = Date.now() - existing.updatedAt.getTime() > LEASE_MS
    if (existing.status === 'FAILED' || leaseExpired) {
      // CAS: só re-reivindica se estado + updatedAt não mudaram (evita corrida com outro worker).
      const reclaimed = await prisma.webhookIdempotency.updateMany({
        where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
        data: { status: 'PROCESSING' },
      })
      if (reclaimed.count === 1) return { outcome: 'CLAIMED', id: existing.id }
      return { outcome: 'IN_PROGRESS' } // outro worker re-reivindicou primeiro
    }

    // PROCESSING dentro do lease → há um processamento concorrente ativo.
    return { outcome: 'IN_PROGRESS' }
  }
}

/**
 * Marca a claim como concluída (PROCESSED) após os efeitos financeiros terminarem.
 * Não-bloqueante: o efeito já concluiu; uma falha aqui só afeta a próxima dedup
 * (a linha fica PROCESSING e será re-reivindicada por lease em um replay).
 */
export async function markWebhookProcessed(claimId: string): Promise<void> {
  await prisma.webhookIdempotency
    .update({ where: { id: claimId }, data: { status: 'PROCESSED' } })
    .catch((err) => {
      console.error('[webhook-idempotency] Falha ao marcar PROCESSED:', err)
    })
}
