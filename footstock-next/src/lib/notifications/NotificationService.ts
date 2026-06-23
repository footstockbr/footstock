// ============================================================================
// FootStock — NotificationService real (FIX-25)
// Substitui o NotificationStub (G-003, histórico em memória) por entrega real:
//   - persistência via prisma.notification.create (fonte da verdade in-app)
//   - email transacional best-effort via Resend (EmailNotificationService)
//   - idempotência permanente por uuid v5 determinístico
// Política: persist-first / email-best-effort (ver Task 11 > "Falha de email").
// O stub vira adapter exclusivo de teste (src/lib/notifications/stubs/NotificationStub).
// ============================================================================

import { createHash } from 'crypto'
import { Prisma, type Notification, type NotificationType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { emailNotificationService } from '@/lib/services/EmailNotificationService'

/**
 * Enumeração FECHADA dos eventos críticos que disparam notificação.
 * Espelha a tabela "Tipos críticos" da Task 11. Adicionar novo evento crítico
 * = adicionar 1 entrada aqui E 1 linha em CRITICAL_EVENTS antes de codar o call site.
 */
export type CriticalNotificationType =
  | 'pagamento_confirmado'
  | 'pagamento_recusado'
  | 'assinatura_expirando'
  | 'assinatura_expirada'
  | 'bonus_creditado'
  | 'reembolso_processado'

/** Canal de entrega resolvido internamente pela tabela (o call site nunca decide email). */
type Canal = 'ambos' | 'persistencia'

export interface NotifyInput {
  /** Evento crítico (enum fechado = tabela "Tipos críticos"). */
  type: CriticalNotificationType
  /** Destinatário in-app. */
  userId: string
  /** paymentId | subscriptionId | refundId | bonusId — define o occurrence_marker. */
  entityId: string
  /** YYYY-MM — obrigatório apenas para type assinatura_* (ciclo de cobrança). */
  period?: string
  /** Dados já resolvidos (sem segredo) para corpo da notificação/email. */
  payload?: Record<string, unknown>
}

export interface NotifyResult {
  notification: Notification
  /** true = no-op idempotente (chamada repetida; nada re-persistido nem re-enviado). */
  deduped: boolean
}

export interface INotificationService {
  notify(input: NotifyInput): Promise<NotifyResult>
}

/**
 * Namespace fixo para o uuid v5 da idempotency_key. NÃO alterar: mudar este valor
 * recalcula todas as chaves e reabre o envio de eventos já entregues.
 */
const IDEMPOTENCY_NAMESPACE = '6f9d8a2e-1c3b-4f7a-9e2d-8b5c0a1f3e6d'

/**
 * uuid v5 (RFC 4122) determinístico via SHA-1, sem dependência externa.
 * SHA-1(namespace_bytes ++ name), com os bits de versão (5) e variante fixados.
 * Mesma (name, namespace) => sempre o mesmo uuid.
 */
function uuidV5(name: string, namespace: string): string {
  const nsBuf = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const bytes = createHash('sha1').update(nsBuf).update(Buffer.from(name, 'utf8')).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // versão 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variante RFC 4122
  const h = bytes.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

interface CriticalEventConfig {
  /** Tipo persistido no Prisma (enum NotificationType do schema). */
  prismaType: NotificationType
  canal: Canal
  /** period obrigatório no occurrence_marker (true para assinatura_*). */
  requiresPeriod: boolean
  /**
   * Regra objetiva de envio de email (coluna canal_email da tabela).
   * Recebe o usuário e se ele optou por NÃO receber email transacional do tipo.
   * Zero Silêncio: sem regra = sem email.
   */
  emailEligible: (user: NotifyUser, optedOutTransactional: boolean) => boolean
  defaultTitle: string
  buildBody: (payload: Record<string, unknown>) => string
}

interface NotifyUser {
  id: string
  email: string
  emailVerified: Date | null
}

const isVerified = (u: NotifyUser) => u.emailVerified !== null

/**
 * Registro fechado dos eventos críticos. Cada entrada mapeia o evento canônico para
 * o tipo Prisma persistido, o canal e a regra objetiva de email.
 */
const CRITICAL_EVENTS: Record<CriticalNotificationType, CriticalEventConfig> = {
  pagamento_confirmado: {
    prismaType: 'PAYMENT_CONFIRMED',
    canal: 'ambos',
    requiresPeriod: false,
    emailEligible: (u) => isVerified(u),
    defaultTitle: 'Pagamento confirmado',
    buildBody: (p) =>
      `Seu pagamento${p.planType ? ` do plano ${String(p.planType)}` : ''} foi confirmado. Bom jogo!`,
  },
  pagamento_recusado: {
    prismaType: 'PAYMENT_FAILED',
    canal: 'ambos',
    requiresPeriod: false,
    emailEligible: (u) => isVerified(u),
    defaultTitle: 'Pagamento não aprovado',
    buildBody: () =>
      'Não conseguimos processar seu pagamento. Atualize sua forma de pagamento para manter o plano ativo.',
  },
  assinatura_expirando: {
    prismaType: 'PLAN_CANCEL_ALERT',
    canal: 'ambos',
    requiresPeriod: true,
    // Único evento que respeita opt-out transacional (lembrete, não fato consumado).
    emailEligible: (u, optedOut) => isVerified(u) && !optedOut,
    defaultTitle: 'Sua assinatura está expirando',
    buildBody: (p) =>
      `Sua assinatura${p.planType ? ` ${String(p.planType)}` : ''} expira em breve${
        p.daysUntilExpiry ? ` (em ${String(p.daysUntilExpiry)} dias)` : ''
      }. Renove para não perder o acesso.`,
  },
  assinatura_expirada: {
    prismaType: 'PLAN_CANCEL_ALERT',
    canal: 'ambos',
    requiresPeriod: true,
    emailEligible: (u) => isVerified(u),
    defaultTitle: 'Sua assinatura expirou',
    buildBody: (p) =>
      `Sua assinatura${p.planType ? ` ${String(p.planType)}` : ''} expirou. Reative quando quiser para voltar a jogar.`,
  },
  bonus_creditado: {
    prismaType: 'BONUS_CREDITED',
    canal: 'persistencia',
    requiresPeriod: false,
    emailEligible: () => false, // sem email (canal apenas persistência)
    defaultTitle: 'Bônus creditado',
    buildBody: (p) =>
      `Seu bônus${p.amount ? ` de FS$ ${String(p.amount)}` : ''} foi creditado na sua conta.`,
  },
  reembolso_processado: {
    prismaType: 'REFUND_PROCESSED',
    canal: 'ambos',
    requiresPeriod: false,
    emailEligible: (u) => isVerified(u),
    defaultTitle: 'Reembolso processado',
    buildBody: (p) =>
      `Seu reembolso${p.amount ? ` de R$ ${String(p.amount)}` : ''} foi processado e deve aparecer na sua fatura em alguns dias.`,
  },
}

export class NotificationService implements INotificationService {
  /**
   * Constrói a idempotency_key determinística "{event}:{entityId}:{occurrenceMarker}".
   * occurrence_marker = entityId+":"+period para assinatura_*, senão entityId.
   * Mesma entrada => sempre a mesma chave (dedupe permanente, sem TTL).
   */
  private buildIdempotencyKey(input: NotifyInput, cfg: CriticalEventConfig): string {
    const occurrenceMarker = cfg.requiresPeriod
      ? `${input.entityId}:${input.period}`
      : input.entityId
    const raw = `${input.type}:${input.entityId}:${occurrenceMarker}`
    return uuidV5(raw, IDEMPOTENCY_NAMESPACE)
  }

  /** Lê o opt-out transacional do usuário para o tipo (NotificationPreference.emailEnabled=false). */
  private async isOptedOutTransactional(userId: string, prismaType: NotificationType): Promise<boolean> {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_notificationType: { userId, notificationType: prismaType } },
      select: { emailEnabled: true },
    })
    // Sem preferência registrada = default (não opt-out). emailEnabled=false = opt-out.
    return pref ? pref.emailEnabled === false : false
  }

  async notify(input: NotifyInput): Promise<NotifyResult> {
    const cfg = CRITICAL_EVENTS[input.type]
    if (!cfg) {
      throw new Error(`[NotificationService] tipo crítico desconhecido: ${input.type}`)
    }
    if (cfg.requiresPeriod && !input.period) {
      throw new Error(
        `[NotificationService] period (YYYY-MM) obrigatório para ${input.type} (occurrence_marker do ciclo de cobrança).`
      )
    }

    const payload = input.payload ?? {}
    const idempotencyKey = this.buildIdempotencyKey(input, cfg)

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, emailVerified: true },
    })

    // Resolução de elegibilidade de email (canal + regra objetiva). Zero Assumido:
    // o serviço resolve; o call site nunca decide.
    let emailEligible = false
    if (cfg.canal === 'ambos' && user) {
      const optedOut = cfg.prismaType === 'PLAN_CANCEL_ALERT' && input.type === 'assinatura_expirando'
        ? await this.isOptedOutTransactional(user.id, cfg.prismaType)
        : false
      emailEligible = cfg.emailEligible(user, optedOut)
    }

    const title = typeof payload.title === 'string' ? payload.title : cfg.defaultTitle
    const body = typeof payload.body === 'string' ? payload.body : cfg.buildBody(payload)

    // 1. Persist-first. email_status inicial: 'pending' quando haverá tentativa de
    //    email; 'na' caso contrário (canal apenas persistência OU critério não satisfeito).
    let notification: Notification
    try {
      notification = await prisma.notification.create({
        data: {
          userId: input.userId,
          type: cfg.prismaType,
          title,
          body,
          data: payload as Prisma.InputJsonValue,
          idempotencyKey,
          emailStatus: emailEligible ? 'pending' : 'na',
        },
      })
    } catch (err) {
      // Conflito de unique em idempotency_key = chamada duplicada (no-op idempotente).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await prisma.notification.findUnique({ where: { idempotencyKey } })
        if (existing) return { notification: existing, deduped: true }
      }
      throw err
    }

    // 2. Email best-effort (apenas quando elegível e usuário presente).
    if (emailEligible && user) {
      const result = await emailNotificationService.sendForTypeResult(cfg.prismaType, user.email, {
        title,
        body,
        ctaLabel: typeof payload.ctaLabel === 'string' ? payload.ctaLabel : undefined,
        ctaUrl: typeof payload.ctaUrl === 'string' ? payload.ctaUrl
          : typeof payload.checkoutUrl === 'string' ? payload.checkoutUrl : undefined,
      })

      // Estado parcial proibido: 'sent' exige provider_id; senão é 'failed' rastreável.
      if (result.status === 'sent' && result.providerId) {
        notification = await prisma.notification.update({
          where: { id: notification.id },
          data: { emailStatus: 'sent', emailProviderId: result.providerId },
        })
      } else {
        notification = await prisma.notification.update({
          where: { id: notification.id },
          data: {
            emailStatus: 'failed',
            emailError: result.error ?? 'envio não confirmado pelo provider (sem id)',
          },
        })
      }
    }

    return { notification, deduped: false }
  }
}

/** Singleton consumido pelos call sites de runtime. */
export const notificationService = new NotificationService()
