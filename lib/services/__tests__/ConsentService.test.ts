// ============================================================================
// Foot Stock — Testes unitários: ConsentService
// Cobre: grantConsent, revokeConsent, getConsents, initializeDefaultConsents, logDataAccess
// Rastreabilidade: TASK-5/GAP-02
// ============================================================================

import { ConsentPurpose } from '@prisma/client'

// ─── Mock: prisma ────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    consent: {
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    dataAccessLog: {
      create: jest.fn().mockReturnValue({ catch: jest.fn() }),
    },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

import { consentService } from '../ConsentService'
import { LGPDError } from '@/lib/errors/lgpd-errors'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-test-123'

function makeConsent(purpose: ConsentPurpose, granted: boolean) {
  return {
    id: `consent-${purpose}`,
    userId: USER_ID,
    purpose,
    granted,
    grantedAt: granted ? new Date() : null,
    revokedAt: granted ? null : new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConsentService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.dataAccessLog.create.mockReturnValue({ catch: jest.fn() })
  })

  describe('grantConsent', () => {
    test('concede consentimento de analytics via upsert', async () => {
      const consent = makeConsent(ConsentPurpose.ANALYTICS, true)
      mockPrisma.consent.upsert.mockResolvedValue(consent)

      const result = await consentService.grantConsent(USER_ID, 'analytics', { ip: '1.2.3.4' })

      expect(result.granted).toBe(true)
      expect(mockPrisma.consent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_purpose: { userId: USER_ID, purpose: ConsentPurpose.ANALYTICS } },
          update: expect.objectContaining({ granted: true }),
          create: expect.objectContaining({ userId: USER_ID, purpose: ConsentPurpose.ANALYTICS, granted: true }),
        })
      )
    })

    test('registra log de acesso fire-and-forget ao conceder', async () => {
      mockPrisma.consent.upsert.mockResolvedValue(makeConsent(ConsentPurpose.MARKETING, true))

      await consentService.grantConsent(USER_ID, 'marketing')

      expect(mockPrisma.dataAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            dataType: 'consent_grant',
          }),
        })
      )
    })

    test('upsert é idempotente — regrant atualiza grantedAt', async () => {
      const consent = makeConsent(ConsentPurpose.ANALYTICS, true)
      mockPrisma.consent.upsert.mockResolvedValue(consent)

      await consentService.grantConsent(USER_ID, 'analytics')
      await consentService.grantConsent(USER_ID, 'analytics')

      expect(mockPrisma.consent.upsert).toHaveBeenCalledTimes(2)
    })
  })

  describe('revokeConsent', () => {
    test('revoga consentimento de marketing', async () => {
      const consent = makeConsent(ConsentPurpose.MARKETING, false)
      mockPrisma.consent.update.mockResolvedValue(consent)

      const result = await consentService.revokeConsent(USER_ID, 'marketing')

      expect(result.granted).toBe(false)
      expect(mockPrisma.consent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_purpose: { userId: USER_ID, purpose: ConsentPurpose.MARKETING } },
          data: expect.objectContaining({ granted: false }),
        })
      )
    })

    test('lança LGPDError ao tentar revogar essential', async () => {
      await expect(consentService.revokeConsent(USER_ID, 'essential'))
        .rejects
        .toThrow(LGPDError)

      expect(mockPrisma.consent.update).not.toHaveBeenCalled()
    })

    test('lança LGPDError ao tentar revogar age_verification', async () => {
      await expect(consentService.revokeConsent(USER_ID, 'age_verification'))
        .rejects
        .toThrow(LGPDError)
    })

    test('erro LGPD_050 tem HTTP 422', async () => {
      try {
        await consentService.revokeConsent(USER_ID, 'essential')
      } catch (e) {
        expect(e).toBeInstanceOf(LGPDError)
        expect((e as LGPDError).code).toBe('LGPD_050')
        expect((e as LGPDError).httpStatus).toBe(422)
      }
    })
  })

  describe('getConsents', () => {
    test('retorna todas as 4 finalidades com defaults para ausentes', async () => {
      mockPrisma.consent.findMany.mockResolvedValue([
        makeConsent(ConsentPurpose.ESSENTIAL, true),
      ])

      const result = await consentService.getConsents(USER_ID)

      expect(result).toHaveLength(5)
      expect(result.find(c => c.purpose === 'essential')?.granted).toBe(true)
      expect(result.find(c => c.purpose === 'analytics')?.granted).toBe(false)
      expect(result.find(c => c.purpose === 'marketing')?.granted).toBe(false)
      expect(result.find(c => c.purpose === 'data_terceiros')?.granted).toBe(false)
    })

    test('isRevocable é false para essential', async () => {
      mockPrisma.consent.findMany.mockResolvedValue([])

      const result = await consentService.getConsents(USER_ID)

      expect(result.find(c => c.purpose === 'essential')?.isRevocable).toBe(false)
      expect(result.find(c => c.purpose === 'analytics')?.isRevocable).toBe(true)
    })
  })

  describe('initializeDefaultConsents', () => {
    test('cria 4 consentimentos padrão em paralelo', async () => {
      mockPrisma.consent.upsert.mockResolvedValue(makeConsent(ConsentPurpose.ESSENTIAL, true))

      await consentService.initializeDefaultConsents(USER_ID)

      // grantConsent('essential') + 3 upserts diretos
      expect(mockPrisma.consent.upsert).toHaveBeenCalledTimes(4)
    })

    test('é idempotente — re-execução não falha', async () => {
      mockPrisma.consent.upsert.mockResolvedValue(makeConsent(ConsentPurpose.ESSENTIAL, true))

      await consentService.initializeDefaultConsents(USER_ID)
      await consentService.initializeDefaultConsents(USER_ID)

      // Sem erros, 8 chamadas no total
      expect(mockPrisma.consent.upsert).toHaveBeenCalledTimes(8)
    })
  })

  describe('logDataAccess', () => {
    test('insere log de acesso fire-and-forget', async () => {
      await consentService.logDataAccess({
        userId: USER_ID,
        accessedBy: USER_ID,
        dataType: 'profile',
        endpoint: '/api/v1/users/me',
      })

      expect(mockPrisma.dataAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            dataType: 'profile',
          }),
        })
      )
    })

    test('falha no log não propaga exceção', async () => {
      const mockCatch = jest.fn()
      mockPrisma.dataAccessLog.create.mockReturnValue({ catch: mockCatch })

      await consentService.logDataAccess({
        userId: USER_ID,
        accessedBy: USER_ID,
        dataType: 'test',
        endpoint: '/test',
      })

      // catch handler é registrado
      expect(mockCatch).toHaveBeenCalled()
    })
  })
})
