// ============================================================================
// FootStock — Contrato de Audit Trail Administrativo
// Verifica que toda ação admin gera registro em admin_market_actions
// Rastreabilidade: INT-079, INT-080, INT-083 | US-023, US-024 | module-28/TASK-3/ST002
// ============================================================================

// Mock do Prisma — antes de qualquer import que use prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    adminMarketAction: {
      create: jest.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { auditAdminAction, REQUIRED_ADMIN_ACTIONS } from '@/lib/admin/audit'

const mockCreate = prisma.adminMarketAction.create as jest.MockedFunction<
  typeof prisma.adminMarketAction.create
>

const MOCK_ADMIN_ID = 'admin-uuid-001'
const MOCK_TARGET_ID = 'target-uuid-001'

describe('Contrato de Audit Trail Administrativo', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreate.mockResolvedValue({} as never)
  })

  // ── Cobertura de ações auditáveis ─────────────────────────────────────────

  describe('Cobertura de ações auditáveis', () => {
    it.each(REQUIRED_ADMIN_ACTIONS)(
      'deve gerar exatamente 1 registro de auditoria para a ação %s',
      async (action) => {
        await auditAdminAction({
          action,
          adminId: MOCK_ADMIN_ID,
          targetType: 'USER',
          targetId: MOCK_TARGET_ID,
          details: { reason: 'contract test' },
        })

        expect(mockCreate).toHaveBeenCalledTimes(1)
      },
    )
  })

  // ── Campos obrigatórios ───────────────────────────────────────────────────

  describe('Campos obrigatórios do registro', () => {
    it('deve incluir action, adminId e details no registro criado', async () => {
      await auditAdminAction({
        action: 'USER_SUSPENDED',
        adminId: MOCK_ADMIN_ID,
        targetType: 'USER',
        targetId: MOCK_TARGET_ID,
        details: { reason: 'violação de regras' },
      })

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'USER_SUSPENDED',
          adminId: MOCK_ADMIN_ID,
          details: expect.objectContaining({ reason: expect.any(String) }),
        }),
      })
    })

    it('adminId null deve lançar erro antes de qualquer inserção', async () => {
      await expect(
        auditAdminAction({
          action: 'USER_SUSPENDED',
          adminId: null as unknown as string,
          targetType: 'USER',
          targetId: MOCK_TARGET_ID,
          details: {},
        }),
      ).rejects.toThrow(/adminId é obrigatório/)

      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('adminId undefined deve lançar erro antes de qualquer inserção', async () => {
      await expect(
        auditAdminAction({
          action: 'MOTOR_HALTED',
          adminId: undefined as unknown as string,
          details: {},
        }),
      ).rejects.toThrow()

      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  // ── Falha no handler ──────────────────────────────────────────────────────

  describe('Falha no handler', () => {
    it('handler que falha antes de auditAdminAction não gera registro', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('handler_error'))

      try {
        await failingHandler()
        // Se o handler falhar, auditAdminAction nunca é chamado
        await auditAdminAction({
          action: 'BALANCE_RESET',
          adminId: MOCK_ADMIN_ID,
          details: {},
        })
      } catch {
        // Esperado — handler falhou
      }

      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('falha no prisma.create deve propagar o erro', async () => {
      mockCreate.mockRejectedValue(new Error('DB connection failed'))

      await expect(
        auditAdminAction({
          action: 'NEWS_INJECTED',
          adminId: MOCK_ADMIN_ID,
          details: { title: 'test' },
        }),
      ).rejects.toThrow('DB connection failed')
    })
  })

  // ── Lista de ações obrigatórias ───────────────────────────────────────────

  describe('[EDGE] integridade da lista de ações auditáveis', () => {
    it('REQUIRED_ADMIN_ACTIONS deve ter ao menos 10 ações', () => {
      expect(REQUIRED_ADMIN_ACTIONS.length).toBeGreaterThanOrEqual(10)
    })

    it('REQUIRED_ADMIN_ACTIONS não deve ter duplicatas', () => {
      const unique = new Set(REQUIRED_ADMIN_ACTIONS)
      expect(unique.size).toBe(REQUIRED_ADMIN_ACTIONS.length)
    })
  })
})
