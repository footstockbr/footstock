// ============================================================================
// FootStock — IncidentNotificationService
// Template de notificação ANPD 72h + registro de incidentes (TASK-3/ST004)
// Rastreabilidade: INT-135, INT-136, US-M13-003
// Referência: Resolução CD/ANPD nº 2/2022
// ============================================================================

import { prisma } from '@/lib/prisma'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface IncidentData {
  type: string
  description: string
  affectedUsers: number
  dataTypes: string[]
  detectedAt: Date
  containedAt?: Date
  estimatedImpact: string
}

export type IncidentType = 'DATA_BREACH' | 'UNAUTHORIZED_ACCESS' | 'DATA_LOSS' | 'SYSTEM_COMPROMISE'
export type IncidentStatus = 'OPEN' | 'NOTIFIED' | 'RESOLVED'

export interface Incident {
  id: string
  type: IncidentType
  description: string
  detectedAt: Date
  notifiedAt?: Date
  anpdDeadline: Date
  status: IncidentStatus
  reportedBy: string
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class IncidentNotificationService {
  // ── Static helpers (LGPD Art. 48 — prazo 72h) ────────────────────────────

  /** Deadline ANPD = detecção + 72 horas */
  static calculateAnpdDeadline(detectedAt: Date): Date {
    const deadline = new Date(detectedAt)
    deadline.setHours(deadline.getHours() + 72)
    return deadline
  }

  /** Verifica se o prazo está próximo (< 24h) */
  static isDeadlineUrgent(anpdDeadline: Date): boolean {
    const hoursRemaining = (anpdDeadline.getTime() - new Date().getTime()) / (1000 * 60 * 60)
    return hoursRemaining > 0 && hoursRemaining < 24
  }

  /** Verifica se o prazo foi excedido */
  static isDeadlineExceeded(anpdDeadline: Date): boolean {
    return new Date() > anpdDeadline
  }

  /** Calcula horas restantes para o prazo */
  static hoursRemaining(anpdDeadline: Date): number {
    const diff = anpdDeadline.getTime() - new Date().getTime()
    return Math.max(0, diff / (1000 * 60 * 60))
  }

  // ── Instance methods ──────────────────────────────────────────────────────

  /**
   * Gera relatório de incidente no formato ANPD.
   * Prazo legal: detectedAt + 72h.
   */
  generateANPDReport(incident: IncidentData): string {
    const deadlineAt = new Date(incident.detectedAt.getTime() + 72 * 60 * 60 * 1000)

    return `
RELATÓRIO DE INCIDENTE — ANPD
================================
CONTROLADOR: FootStock App
CNPJ: [CNPJ — preencher antes do envio]
DPO: [Nome do DPO] | privacy@footstock.com.br

INCIDENTE:
Tipo: ${incident.type}
Descrição: ${incident.description}
Detectado em: ${incident.detectedAt.toISOString()}
${incident.containedAt ? `Contido em: ${incident.containedAt.toISOString()}` : 'Status: Em investigação'}

IMPACTO:
Titulares afetados (estimativa): ${incident.affectedUsers}
Tipos de dados: ${incident.dataTypes.join(', ')}
Impacto estimado: ${incident.estimatedImpact}

MEDIDAS ADOTADAS: [a preencher pelo DPO]

PRAZO ANPD: ${deadlineAt.toISOString()} (72h a partir da detecção)
Link peticionamento: https://www.gov.br/anpd/peticionamento
    `.trim()
  }

  /**
   * Envia notificação de incidente ao DPO via email e registra no banco.
   * Loga falhas sem propagar — o incidentLog é criado mesmo se o email falha.
   */
  async sendANPDNotification(incident: IncidentData): Promise<void> {
    const report = this.generateANPDReport(incident)
    const deadlineAt = new Date(incident.detectedAt.getTime() + 72 * 60 * 60 * 1000)
    let emailSent = false

    const apiKey = process.env.RESEND_API_KEY
    if (apiKey) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(apiKey)
        const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@footstock.app'

        await resend.emails.send({
          from: `Sistema FootStock <${from}>`,
          to: 'privacy@footstock.com.br',
          subject: `[URGENTE] Incidente de Segurança — prazo ANPD ${deadlineAt.toLocaleDateString('pt-BR')}`,
          text: report,
        })
        emailSent = true
      } catch (err) {
        console.error('[IncidentNotificationService] Falha ao enviar email ANPD:', err)
      }
    } else {
      console.warn('[IncidentNotificationService] RESEND_API_KEY não configurado. Email não enviado.')
    }

    // Registrar incidente no banco independente do email
    // Se email falhou, marcar como pendente de retry manual pelo DPO
    await prisma.incidentLog.create({
      data: {
        type: incident.type,
        description: incident.description,
        affectedUsers: incident.affectedUsers,
        dataTypes: incident.dataTypes,
        detectedAt: incident.detectedAt,
        containedAt: incident.containedAt,
        estimatedImpact: incident.estimatedImpact,
        report,
        emailSent,
      },
    })

    if (!emailSent) {
      console.warn(
        `[IncidentNotificationService] AÇÃO NECESSÁRIA: Incidente registrado mas email NÃO enviado. ` +
        `O DPO deve disparar manualmente o relatório ANPD antes do prazo: ${deadlineAt.toISOString()}`
      )
    }
  }
}

export const incidentNotificationService = new IncidentNotificationService()
