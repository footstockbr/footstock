// ============================================================================
// Foot Stock — ConsentService
// Gerenciamento de consentimentos LGPD por finalidade (TASK-1/ST002)
// Rastreabilidade: INT-102, US-026, US-M13-001
// ============================================================================

import { ConsentPurpose } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { LGPDError, LGPD_ERRORS } from '@/lib/errors/lgpd-errors'

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type ConsentPurposeKey =
  | 'essential'
  | 'analytics'
  | 'marketing'
  | 'data_terceiros'
  | 'age_verification'

export interface ConsentSummary {
  purpose: ConsentPurposeKey
  granted: boolean
  grantedAt: Date | null
  revokedAt: Date | null
  isRevocable: boolean
  updatedAt: Date
}

export interface DataAccessLogInput {
  userId: string
  accessedBy: string
  dataType: string
  endpoint: string
  reason?: string
  ip?: string
}

// ─── Constantes ──────────────────────────────────────────────────────────────

// Mapeamento string → enum Prisma
const PURPOSE_MAP: Record<ConsentPurposeKey, ConsentPurpose> = {
  essential:       ConsentPurpose.ESSENTIAL,
  analytics:       ConsentPurpose.ANALYTICS,
  marketing:       ConsentPurpose.MARKETING,
  data_terceiros:  ConsentPurpose.DATA_TERCEIROS,
  age_verification: ConsentPurpose.AGE_VERIFICATION,
}

// Mapeamento inverso enum → string
const PURPOSE_REVERSE: Record<ConsentPurpose, ConsentPurposeKey> = {
  [ConsentPurpose.ESSENTIAL]:       'essential',
  [ConsentPurpose.ANALYTICS]:       'analytics',
  [ConsentPurpose.MARKETING]:       'marketing',
  [ConsentPurpose.DATA_TERCEIROS]:  'data_terceiros',
  [ConsentPurpose.AGE_VERIFICATION]: 'age_verification',
}

const NON_REVOCABLE: ConsentPurposeKey[] = ['essential', 'age_verification']
const ALL_PURPOSES: ConsentPurposeKey[] = ['essential', 'analytics', 'marketing', 'data_terceiros', 'age_verification']

// ─── Service ─────────────────────────────────────────────────────────────────

class ConsentService {
  /** Concede consentimento para uma finalidade. Idempotente (upsert). */
  async grantConsent(
    userId: string,
    purpose: ConsentPurposeKey,
    meta: { ip?: string; userAgent?: string } = {}
  ) {
    const prismaoPurpose = PURPOSE_MAP[purpose]
    const consent = await prisma.consent.upsert({
      where: { userId_purpose: { userId, purpose: prismaoPurpose } },
      update: {
        granted: true,
        grantedAt: new Date(),
        revokedAt: null,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
      create: {
        userId,
        purpose: prismaoPurpose,
        granted: true,
        grantedAt: new Date(),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    })

    void this.logDataAccess({
      userId,
      accessedBy: userId,
      dataType: 'consent_grant',
      endpoint: 'ConsentService.grantConsent',
      ip: meta.ip,
    })

    return consent
  }

  /** Revoga consentimento. Lança LGPDError para finalidades não revogáveis. */
  async revokeConsent(userId: string, purpose: ConsentPurposeKey) {
    if (NON_REVOCABLE.includes(purpose)) {
      throw new LGPDError(
        LGPD_ERRORS.CANNOT_REVOKE.code,
        LGPD_ERRORS.CANNOT_REVOKE.message,
        LGPD_ERRORS.CANNOT_REVOKE.status
      )
    }

    const prismaoPurpose = PURPOSE_MAP[purpose]
    const consent = await prisma.consent.update({
      where: { userId_purpose: { userId, purpose: prismaoPurpose } },
      data: { granted: false, revokedAt: new Date() },
    })

    void this.logDataAccess({
      userId,
      accessedBy: userId,
      dataType: 'consent_revoke',
      endpoint: 'ConsentService.revokeConsent',
    })

    return consent
  }

  /** Retorna todos os consentimentos do usuário (inclusive finalidades sem registro). */
  async getConsents(userId: string): Promise<ConsentSummary[]> {
    const records = await prisma.consent.findMany({ where: { userId } })

    const map = new Map(records.map(r => [PURPOSE_REVERSE[r.purpose], r]))

    void this.logDataAccess({
      userId,
      accessedBy: userId,
      dataType: 'consents',
      endpoint: 'ConsentService.getConsents',
    })

    return ALL_PURPOSES.map(p => {
      const record = map.get(p)
      return {
        purpose: p,
        granted: record?.granted ?? false,
        grantedAt: record?.grantedAt ?? null,
        revokedAt: record?.revokedAt ?? null,
        isRevocable: !NON_REVOCABLE.includes(p),
        updatedAt: record?.updatedAt ?? new Date(0),
      }
    })
  }

  /**
   * Log de acesso a dados pessoais — fire-and-forget.
   * Nunca lança exceção (log não pode quebrar a operação principal).
   */
  async logDataAccess(params: DataAccessLogInput): Promise<void> {
    void prisma.dataAccessLog
      .create({
        data: {
          userId: params.userId,
          accessedBy: params.accessedBy,
          dataType: params.dataType,
          endpoint: params.endpoint,
          reason: params.reason,
          ipAddress: params.ip,
        },
      })
      .catch(() => {
        // Silencioso: falha no log nunca propaga
      })
  }

  /**
   * Inicializa consentimentos padrão para um novo usuário.
   * Idempotente (upsert cada finalidade).
   */
  async initializeDefaultConsents(userId: string): Promise<void> {
    await Promise.all([
      this.grantConsent(userId, 'essential'),
      this.grantConsent(userId, 'age_verification'),
      prisma.consent.upsert({
        where: { userId_purpose: { userId, purpose: ConsentPurpose.ANALYTICS } },
        update: {},
        create: { userId, purpose: ConsentPurpose.ANALYTICS, granted: false },
      }),
      prisma.consent.upsert({
        where: { userId_purpose: { userId, purpose: ConsentPurpose.MARKETING } },
        update: {},
        create: { userId, purpose: ConsentPurpose.MARKETING, granted: false },
      }),
      prisma.consent.upsert({
        where: { userId_purpose: { userId, purpose: ConsentPurpose.DATA_TERCEIROS } },
        update: {},
        create: { userId, purpose: ConsentPurpose.DATA_TERCEIROS, granted: false },
      }),
    ])
  }
}

export const consentService = new ConsentService()
