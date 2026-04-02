// ============================================================================
// Foot Stock — Testes unitários: IncidentNotificationService
// Cobre: generateANPDReport (72h deadline), sendANPDNotification (email fail → emailSent=false)
// Rastreabilidade: TASK-5/GAP-05
// ============================================================================

jest.mock('@/lib/prisma', () => ({
  prisma: {
    incidentLog: { create: jest.fn() },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

import { incidentNotificationService, type IncidentData } from '../IncidentNotificationService'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIncident(overrides: Partial<IncidentData> = {}): IncidentData {
  return {
    type: 'Vazamento de dados',
    description: 'Acesso não autorizado à tabela users',
    affectedUsers: 150,
    dataTypes: ['email', 'nome', 'telefone'],
    detectedAt: new Date('2026-03-26T14:00:00Z'),
    estimatedImpact: 'Médio — dados pessoais expostos',
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IncidentNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.incidentLog.create.mockResolvedValue({ id: 'log-1' })
    delete process.env.RESEND_API_KEY
  })

  describe('generateANPDReport', () => {
    test('calcula deadline 72h corretamente', () => {
      const incident = makeIncident({ detectedAt: new Date('2026-03-26T14:00:00Z') })
      const report = incidentNotificationService.generateANPDReport(incident)

      expect(report).toContain('2026-03-29T14:00:00.000Z') // 72h depois
    })

    test('inclui dados do controlador e DPO', () => {
      const report = incidentNotificationService.generateANPDReport(makeIncident())

      expect(report).toContain('Foot Stock App')
      expect(report).toContain('privacy@footstock.com.br')
      expect(report).toContain('RELATÓRIO DE INCIDENTE')
    })

    test('inclui tipo e descrição do incidente', () => {
      const incident = makeIncident({ type: 'Ransomware', description: 'Criptografia de dados' })
      const report = incidentNotificationService.generateANPDReport(incident)

      expect(report).toContain('Ransomware')
      expect(report).toContain('Criptografia de dados')
    })

    test('inclui titulares afetados e tipos de dados', () => {
      const incident = makeIncident({ affectedUsers: 500, dataTypes: ['cpf', 'email'] })
      const report = incidentNotificationService.generateANPDReport(incident)

      expect(report).toContain('500')
      expect(report).toContain('cpf, email')
    })

    test('exibe status "Em investigação" se não contido', () => {
      const report = incidentNotificationService.generateANPDReport(makeIncident())
      expect(report).toContain('Em investigação')
    })

    test('exibe data de contenção se disponível', () => {
      const incident = makeIncident({ containedAt: new Date('2026-03-26T16:00:00Z') })
      const report = incidentNotificationService.generateANPDReport(incident)

      expect(report).toContain('Contido em: 2026-03-26T16:00:00.000Z')
      expect(report).not.toContain('Em investigação')
    })

    test('inclui link de peticionamento ANPD', () => {
      const report = incidentNotificationService.generateANPDReport(makeIncident())
      expect(report).toContain('https://www.gov.br/anpd/peticionamento')
    })
  })

  describe('sendANPDNotification', () => {
    test('registra incidentLog com emailSent=false quando RESEND_API_KEY ausente', async () => {
      await incidentNotificationService.sendANPDNotification(makeIncident())

      expect(mockPrisma.incidentLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emailSent: false,
            type: 'Vazamento de dados',
          }),
        })
      )
    })

    test('registra incidentLog mesmo em falha de email', async () => {
      process.env.RESEND_API_KEY = 'test-key'

      // Mock resend to throw
      jest.mock('resend', () => ({
        Resend: jest.fn().mockImplementation(() => ({
          emails: {
            send: jest.fn().mockRejectedValue(new Error('Resend API error')),
          },
        })),
      }))

      await incidentNotificationService.sendANPDNotification(makeIncident())

      expect(mockPrisma.incidentLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailSent: false }),
        })
      )
    })

    test('persiste todos os campos do incidente no banco', async () => {
      const incident = makeIncident()
      await incidentNotificationService.sendANPDNotification(incident)

      const createCall = mockPrisma.incidentLog.create.mock.calls[0][0]
      expect(createCall.data.type).toBe(incident.type)
      expect(createCall.data.description).toBe(incident.description)
      expect(createCall.data.affectedUsers).toBe(incident.affectedUsers)
      expect(createCall.data.dataTypes).toEqual(incident.dataTypes)
      expect(createCall.data.report).toContain('RELATÓRIO DE INCIDENTE')
    })
  })
})
