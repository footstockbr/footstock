// lib/services/EmailNotificationService.ts
// module-19 — Canal email para notificações transacionais
// Usa Resend como provider (mesma infra do DataExportService)

import type { NotificationType } from '@/types'

interface EmailPayload {
  to: string
  subject: string
  html: string
}

// Tipos que disparam email (baseado em NOTIFICATION-SPEC.md)
// ADMIN_BROADCAST removido: spec define apenas canal in-app (sem base legal para email broadcast)
// BONUS_CREDITED adicionado: NOTIF-009 define template de email obrigatório
const EMAIL_CHANNEL_TYPES = new Set<NotificationType>([
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'PLAN_CANCEL_ALERT',
  'CANCELLATION_LOCK_ACTIVE',
  'CANCELLATION_LOCK_LIQUIDATED',
  'PASSWORD_RESET',
  'LGPD_EXPORT_READY',
  'ACCOUNT_DELETED',
  'BRUTE_FORCE_BLOCKED',
  'MARGIN_CALL_ALERT',     // 80% — crítico
  'MARGIN_CALL_WARNING',   // 50% — aviso
  'BONUS_CREDITED',        // NOTIF-009: email de confirmação após T+7 dias
])

class EmailNotificationService {
  private getApiKey(): string | undefined {
    return process.env.RESEND_API_KEY
  }

  private getFromAddress(): string {
    return process.env.RESEND_FROM_EMAIL ?? 'noreply@footstock.app'
  }

  hasEmailChannel(type: NotificationType): boolean {
    return EMAIL_CHANNEL_TYPES.has(type)
  }

  /**
   * Envia email transacional via Resend.
   * Falha silenciosa — não bloqueia o canal in-app.
   */
  async send(payload: EmailPayload): Promise<void> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      console.warn('[EmailNotificationService] RESEND_API_KEY não configurado. Email não enviado para:', payload.to)
      return
    }

    try {
      const { Resend } = await import('resend')
      const resend = new Resend(apiKey)
      const result = await resend.emails.send({
        from: `FootStock <${this.getFromAddress()}>`,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      })
      if (result.error) {
        console.error('[EmailNotificationService] Erro Resend:', result.error)
      }
    } catch (err) {
      console.error('[EmailNotificationService] Falha ao enviar email:', err)
    }
  }

  /**
   * Gera e envia email para um tipo de notificação específico.
   * Retorna false se o tipo não possui canal email.
   */
  async sendForType(
    type: NotificationType,
    to: string,
    data: {
      userName?: string
      title: string
      body: string
      ctaLabel?: string
      ctaUrl?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<boolean> {
    if (!this.hasEmailChannel(type)) return false

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://footstock.app'
    const ctaHtml = data.ctaLabel && data.ctaUrl
      ? `<p style="margin-top:24px">
           <a href="${data.ctaUrl}" style="padding:12px 24px;background:#F0B90B;color:#0B0E11;text-decoration:none;border-radius:6px;font-weight:bold">
             ${data.ctaLabel}
           </a>
         </p>`
      : ''

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="font-family:Arial,sans-serif;background:#0B0E11;color:#EAECEF;margin:0;padding:0">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:32px 16px">
          <tr>
            <td style="background:#181A20;border-radius:8px;padding:32px;border:1px solid rgba(240,185,11,.15)">
              <img src="${appUrl}/logo.png" alt="FootStock" height="32" style="margin-bottom:24px" />
              <h2 style="color:#EAECEF;margin:0 0 16px">${data.title}</h2>
              <p style="color:#929AA5;line-height:1.6;margin:0 0 16px">${data.body}</p>
              ${ctaHtml}
              <p style="color:#707A8A;font-size:12px;margin-top:32px;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">
                Este email é transacional e não pode ser descadastrado.<br>
                FootStock — ${appUrl}
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    const subjects: Partial<Record<NotificationType, string>> = {
      PAYMENT_CONFIRMED: 'Pagamento confirmado — FootStock',
      PAYMENT_FAILED: 'Não conseguimos processar seu pagamento',
      PLAN_CANCEL_ALERT: 'Sua assinatura FootStock foi cancelada',
      CANCELLATION_LOCK_ACTIVE: 'Atenção: Trava de cancelamento ativada',
      CANCELLATION_LOCK_LIQUIDATED: 'Suas posições foram liquidadas automaticamente',
      PASSWORD_RESET: 'Redefinição de senha solicitada',
      LGPD_EXPORT_READY: 'Seus dados do FootStock estão prontos',
      ACCOUNT_DELETED: 'Sua conta foi excluída — FootStock',
      BRUTE_FORCE_BLOCKED: 'Atividade suspeita detectada na sua conta',
      MARGIN_CALL_ALERT: '⚠️ Alerta crítico de margem — Ação necessária',
      MARGIN_CALL_WARNING: 'Aviso de margem — FootStock',
      BONUS_CREDITED: 'Seu bônus foi creditado — FootStock', // NOTIF-009
    }

    await this.send({
      to,
      subject: subjects[type] ?? data.title,
      html,
    })

    return true
  }
}

export const emailNotificationService = new EmailNotificationService()
