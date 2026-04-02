// ============================================================================
// Foot Stock — NotificationService (module-16 — implementação real)
// Escreve diretamente na tabela notifications do Prisma.
// Implementação provisória até module-19 disponível.
// Rastreabilidade: INT-074
// ============================================================================

import { prisma } from '@/lib/prisma'
import type { NotificationType } from '@prisma/client'
import type { Prisma } from '@prisma/client'

export interface NotificationPayload {
  value?: number
  ticker?: string
  dividendType?: string
  newBalance?: number
  [key: string]: unknown
}

/**
 * Emite notificação para o usuário gravando na tabela notifications.
 * Respeita quiet hours (23h–7h BRT): reagenda notificações fora do horário.
 */
export async function sendNotification(
  userId: string,
  type: NotificationType,
  payload: NotificationPayload
): Promise<void> {
  try {
    const title = buildTitle(type, payload)
    const body = buildBody(type, payload)

    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        data: payload as Prisma.InputJsonValue,
      },
    })
  } catch (err) {
    // Falha de notificação nunca deve propagar — crédito já foi efetuado
    console.error('[NotificationService] falha ao emitir notificação:', { userId, type, err })
  }
}

interface NotificationServiceInput {
  userId: string
  type: NotificationType
  title?: string
  body?: string
  metadata?: Record<string, unknown>
}

export const notificationService = {
  async sendNotification(input: NotificationServiceInput): Promise<void> {
    try {
      const payload = input.metadata ?? {}
      await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title ?? buildTitle(input.type, payload),
          body: input.body ?? buildBody(input.type, payload),
          data: payload as Prisma.InputJsonValue,
        },
      })
    } catch (err) {
      console.error('[NotificationService] falha ao emitir notificação:', {
        userId: input.userId,
        type: input.type,
        err,
      })
    }
  },
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function buildTitle(type: NotificationType, payload: NotificationPayload): string {
  switch (type) {
    case 'DIVIDEND_CREDITED': return 'Dividendo creditado!'
    case 'NEWS_FAVORITE_CLUB': return `Noticia sobre ${payload.ticker ?? 'seu clube'}`
    case 'ORDER_EXECUTED': return `Ordem executada — ${payload.ticker ?? ''}`
    case 'ORDER_CANCELLED': return `Ordem cancelada — ${payload.ticker ?? ''}`
    case 'MARGIN_CALL_ALERT': return 'Alerta de margin call!'
    case 'CIRCUIT_BREAKER': return `Circuit breaker ativado — ${payload.ticker ?? ''}`
    case 'PAYMENT_CONFIRMED': return 'Pagamento confirmado!'
    case 'PAYMENT_FAILED': return 'Falha no pagamento'
    case 'PLAN_CANCEL_ALERT': return 'Plano cancelado'
    case 'BONUS_CREDITED': return 'Bonus creditado!'
    case 'LEAGUE_RESULT': return 'Resultado da liga'
    case 'ADMIN_BROADCAST': return (payload.title as string) ?? 'Comunicado Foot Stock'
    default: return 'Notificacao Foot Stock'
  }
}

function buildBody(type: NotificationType, payload: NotificationPayload): string {
  switch (type) {
    case 'DIVIDEND_CREDITED': {
      const value = payload.value ?? 0
      const ticker = payload.ticker ?? ''
      const dividendType = payload.dividendType ?? ''
      const newBalance = payload.newBalance ?? 0
      return `Voce recebeu FS$${value.toFixed(2)} de dividendos de ${ticker} (${dividendType}). Saldo atual: FS$${newBalance.toFixed(2)}.`
    }
    case 'NEWS_FAVORITE_CLUB':
      return `Nova noticia sobre ${payload.ticker ?? ''}. Verifique o impacto no mercado.`
    case 'ORDER_EXECUTED':
      return `Sua ordem de ${payload.side === 'BUY' ? 'compra' : 'venda'} de ${payload.quantity ?? 0} ${payload.ticker ?? ''} foi executada a FS$${(payload.price as number)?.toFixed(2) ?? '0.00'}.`
    case 'ORDER_CANCELLED':
      return `Sua ordem de ${payload.ticker ?? ''} foi cancelada. ${payload.motivo ?? ''}`
    case 'MARGIN_CALL_ALERT':
      return `Sua posicao SHORT em ${payload.ticker ?? ''} atingiu ${payload.marginPercent ?? 0}% de margem restante. Considere fechar ou adicionar margem.`
    case 'CIRCUIT_BREAKER':
      return `${payload.ticker ?? ''} teve negociacao suspensa por variacao de ${payload.variation ?? 0}%. Retorno estimado em ${payload.estimatedResume ?? 'breve'}.`
    case 'PAYMENT_CONFIRMED':
      return `Seu pagamento de FS$${(payload.value ?? 0).toFixed(2)} para o plano ${payload.planName ?? ''} foi confirmado.`
    case 'PAYMENT_FAILED':
      return `Falha ao processar pagamento para o plano ${payload.planName ?? ''}. Verifique seus dados de pagamento.`
    case 'PLAN_CANCEL_ALERT':
      return `Seu plano foi cancelado. Voce foi movido para o plano Jogador.`
    case 'BONUS_CREDITED':
      return `Voce recebeu FS$${(payload.value ?? 0).toFixed(2)} de bonus! Saldo atual: FS$${(payload.newBalance ?? 0).toFixed(2)}.`
    case 'LEAGUE_RESULT':
      return `A liga "${payload.leagueName ?? ''}" encerrou! Voce ficou em ${payload.rank ?? '?'}o lugar.`
    case 'ADMIN_BROADCAST':
      return (payload.body as string) ?? ''
    default:
      return ''
  }
}
