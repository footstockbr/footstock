// ============================================================================
// FootStock — SubscriptionReconcileService: polling de status de assinatura recorrente
// (loop 06-24, Task 008). Distinto do cron reconcile-payments (recuperacao de pagamento
// one-time cujo webhook se perdeu). Aqui varremos assinaturas `recurring` (auto-debito no
// gateway) e corrigimos `gatewayStatus`/`status` divergente quando o webhook de mudanca de
// estado se perdeu — defesa de profundidade do espelho local vs. estado real no provedor.
// Referencia: INV-3 (indeterminado nunca confirma estado), Task 007 (parser de webhook).
// ============================================================================

import { prisma } from '@/lib/prisma'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayType } from '@/lib/gateways/IGateway'
import type { ProcessResult } from '@/lib/jobs/subscription-expiry'

// Statuses locais que ainda valem reconciliar (nao-terminais). Uma assinatura ja CANCELLED/
// EXPIRED localmente nao precisa de polling: o estado terminal e absorvente deste lado.
const RECONCILABLE_STATUSES = [
  'ACTIVE',
  'PENDING',
  'SUSPENDED',
  'PAST_DUE',
  'CANCELLATION_LOCK',
] as const

// Mapeamento status BRUTO do preapproval (MP) -> SubscriptionStatus canonico.
// Statuses fora deste mapa sao IGNORADOS (Zero Assumido): nunca inferimos transicao a partir de
// um status desconhecido; apenas registramos como skip e seguimos.
const MP_STATUS_TO_CANONICAL: Record<string, string> = {
  authorized: 'ACTIVE',
  paused:     'SUSPENDED',
  cancelled:  'CANCELLED',
  pending:    'PENDING',
}

// Forma minima exposta pelo gateway para polling (mesma idiomatica de reconcile-payments:
// narrow-cast em vez de inchar a IGateway com um metodo que so o MP implementa hoje).
interface SubscriptionStatusQuery {
  getSubscriptionStatus(gatewaySubscriptionId: string): Promise<{ status: string | null }>
}

export class SubscriptionReconcileService {
  /**
   * Varre assinaturas recorrentes (MERCADO_PAGO) com identidade no gateway e reconcilia o espelho
   * local quando ele diverge do status real do preapproval. Idempotente: assinatura ja em sincronia
   * gera apenas refresh de auditoria (ou no-op). Cada falha por assinatura e isolada (uma nao
   * derruba o sweep), no mesmo padrao do cron reconcile-payments.
   *
   * @param opts.limit numero maximo de assinaturas varridas por execucao (clamp 1..200, default 50)
   * @param opts.sinceDays janela de criacao varrida em dias (clamp 1..120, default 30)
   */
  async reconcile(opts: { limit?: number; sinceDays?: number } = {}): Promise<ProcessResult> {
    const now = new Date()
    const result: ProcessResult = { processed: 0, errors: 0, details: [] }

    const limit = clamp(opts.limit ?? 50, 1, 200)
    const sinceDays = clamp(opts.sinceDays ?? 30, 1, 120)
    const since = new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000)

    const subs = await prisma.subscription.findMany({
      where: {
        billingMode: 'recurring',
        gateway: 'MERCADO_PAGO',
        gatewaySubscriptionId: { not: null },
        status: { in: RECONCILABLE_STATUSES as unknown as never[] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id:                    true,
        status:                true,
        gatewayStatus:         true,
        gatewaySubscriptionId: true,
      },
    })

    // Narrow-cast: so o MercadoPagoGateway implementa getSubscriptionStatus hoje; varremos apenas
    // gateway MERCADO_PAGO, entao o cast e seguro por construcao do where acima.
    const gw = getGateway(GatewayType.MERCADO_PAGO) as unknown as SubscriptionStatusQuery

    // Sequencial de proposito: limita o ritmo de chamadas ao MP (1 GET /preapproval por assinatura).
    for (const sub of subs) {
      try {
        const { status: rawStatus } = await gw.getSubscriptionStatus(sub.gatewaySubscriptionId!)

        if (!rawStatus) {
          // MP nao reportou status: indeterminado, nao tocamos no espelho (Zero Assumido).
          result.details.push({ subscriptionId: sub.id, action: 'SKIP_NO_GATEWAY_STATUS' })
          continue
        }

        const canonical = MP_STATUS_TO_CANONICAL[rawStatus]
        if (!canonical) {
          // Status bruto fora do mapa conhecido: registra e segue, nunca infere transicao.
          result.details.push({ subscriptionId: sub.id, action: `SKIP_UNMAPPED_${rawStatus}` })
          continue
        }

        const statusDiverged = canonical !== sub.status
        const auditDiverged = rawStatus !== sub.gatewayStatus

        // PENDING → ACTIVE exige ENTITLEMENT (User.planType + Payment), que SÓ o payment-reconcile
        // (reconcile-payments -> reconcileApprovedPayment/upgradeUser) aplica. Um bare-flip de status
        // aqui deixaria a sub ACTIVE SEM plano e SEM Payment: o usuário paga e fica sem entitlement, e
        // o checkout passa a bloquear por assinatura ACTIVE (lockout). Defere a ativação de PENDING
        // ao payment-reconcile, que ativa corretamente (upgradeUser + Payment + planType).
        if (sub.status === 'PENDING' && canonical === 'ACTIVE') {
          result.details.push({ subscriptionId: sub.id, action: 'SKIP_PENDING_ACTIVATION_DEFER_PAYMENT_RECONCILE' })
          continue
        }

        // CANCELLATION_LOCK pausa o preapproval no gateway DE PROPÓSITO (janela reversível de
        // cancelamento). Ler 'paused' (canonical SUSPENDED) é o estado CONSISTENTE do lock, NÃO uma
        // divergência — rebaixar CANCELLATION_LOCK -> SUSPENDED perderia a janela/expiração do lock
        // e o caminho de reversão (revert). Só reconciliamos o lock quando o gateway está TERMINAL
        // ('cancelled' -> CANCELLED). A auditoria (gatewayStatus) ainda é refrescada.
        if (sub.status === 'CANCELLATION_LOCK' && canonical !== 'CANCELLED') {
          // Gateway 'authorized' (auto-renew VIVO) durante o lock = divergência PERIGOSA: o
          // preapproval poderia COBRAR dentro da janela de cancelamento (cobrança-fantasma). O lock
          // exige o auto-renew PAUSADO — re-pausar (best-effort) + [ALERT]. ('paused' já é consistente.)
          if (rawStatus === 'authorized') {
            try {
              const gwRepause = getGateway(GatewayType.MERCADO_PAGO) as unknown as {
                cancelAutoRenewal(id: string): Promise<void>
              }
              await gwRepause.cancelAutoRenewal(sub.gatewaySubscriptionId!)
              result.details.push({ subscriptionId: sub.id, action: 'REPAUSED_CANCELLATION_LOCK_authorized' })
            } catch (repErr) {
              console.error(
                `[reconcile][ALERT] CANCELLATION_LOCK ${sub.id} com gateway AUTHORIZED — re-pause falhou ` +
                `(auto-renew vivo na janela de cancelamento, risco de cobrança):`, repErr,
              )
              result.details.push({ subscriptionId: sub.id, action: 'SKIP_CANCELLATION_LOCK_authorized_REPAUSE_FAILED' })
            }
            continue
          }
          if (auditDiverged) {
            // CAS: só refresca o gatewayStatus se AINDA está em CANCELLATION_LOCK. Sem o guard de
            // status, um reconcile atrasado poderia gravar um gatewayStatus stale ('paused') numa
            // sub que já reverteu para ACTIVE — fazendo um cancelamento futuro tratar 'paused' como
            // no-op e NÃO pausar um gateway realmente autorizado.
            await prisma.subscription.updateMany({
              where: { id: sub.id, status: 'CANCELLATION_LOCK' },
              data: { gatewayStatus: rawStatus },
            })
          }
          result.details.push({ subscriptionId: sub.id, action: `SKIP_CANCELLATION_LOCK_${rawStatus}` })
          continue
        }

        if (!statusDiverged) {
          // Status em sincronia. Atualiza so a auditoria (gatewayStatus) quando o bruto mudou.
          if (auditDiverged) {
            await prisma.subscription.update({
              where: { id: sub.id },
              data:  { gatewayStatus: rawStatus },
            })
            result.details.push({ subscriptionId: sub.id, action: 'GATEWAY_STATUS_REFRESHED' })
          } else {
            result.details.push({ subscriptionId: sub.id, action: 'IN_SYNC' })
          }
          continue
        }

        // 'cancelled' no gateway = CANCEL-AT-PERIOD-END — MESMA semântica do webhook
        // SUBSCRIPTION_CANCELLED (route). NÃO terminar a sub aqui: saltar direto para status=CANCELLED
        // bypassaria os crons de expiração/downgrade (subscription-expiry) que resetam User.planType,
        // encalhando o dono num tier PAGO sem assinatura viva (benefit-leak + bloqueio de
        // re-assinatura do mesmo tier). Marca a intenção (cancelAtPeriodEnd) e deixa o lifecycle
        // resolver no vencimento. EXCEÇÃO: CANCELLATION_LOCK + cancelled é o fim natural do lock -> terminal.
        const applyCancelAtPeriodEnd = canonical === 'CANCELLED' && sub.status !== 'CANCELLATION_LOCK'
        // Divergencia real de status. CAS por updateMany (where inclui o status lido): se outro
        // caminho (webhook, cancelamento) mudou o estado concorrentemente, nao sobrescrevemos.
        const patch: {
          status?: string
          gatewayStatus: string
          cancelledAt?: Date
          cancelAtPeriodEnd?: boolean
        } = applyCancelAtPeriodEnd
          ? { gatewayStatus: rawStatus, cancelAtPeriodEnd: true }
          : { status: canonical, gatewayStatus: rawStatus }
        if (canonical === 'CANCELLED' && !applyCancelAtPeriodEnd) {
          // Fim natural do CANCELLATION_LOCK: registra o instante do cancelamento espelhado.
          patch.cancelledAt = now
        }

        const applied = await prisma.subscription.updateMany({
          where: { id: sub.id, status: sub.status },
          data:  patch as never,
        })

        if (applied.count === 0) {
          // Estado mudou entre a leitura e a escrita: outro caminho ja reconciliou.
          result.details.push({ subscriptionId: sub.id, action: 'SKIP_CONCURRENT_CHANGE' })
          continue
        }

        result.details.push({
          subscriptionId: sub.id,
          action: applyCancelAtPeriodEnd
            ? `RECONCILED_${sub.status}_CANCEL_AT_PERIOD_END`
            : `RECONCILED_${sub.status}_TO_${canonical}`,
        })
        result.processed++
      } catch (err) {
        // GatewayRetryableError (token ausente, 5xx, timeout) e qualquer outra falha: isola por
        // assinatura. Indeterminado NUNCA vira mudanca de estado (INV-3).
        console.warn(`[SubscriptionReconcileService] Erro em ${sub.id}:`, err)
        result.errors++
        result.details.push({ subscriptionId: sub.id, action: 'ERROR', error: String(err) })
      }
    }

    return result
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.trunc(value), min), max)
}

export const subscriptionReconcileService = new SubscriptionReconcileService()
