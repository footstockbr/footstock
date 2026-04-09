/**
 * Testes unitários — Middleware admin-audit.ts
 * Module: module-23-admin-usuarios-financeiro / TASK-4
 * Invariante: importar SEMPRE de 'lib/middleware/admin-audit' (nunca de 'lib/services/admin/')
 */

import { logAdminAction } from '@/lib/middleware/admin-audit'

// Mock do Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    adminMarketAction: {
      create: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    },
  },
}))

describe('Admin Audit Trail Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('logAdminAction', () => {
    it('deve registrar ação administrativa no banco', async () => {
      const { prisma } = await import('@/lib/prisma')

      await logAdminAction({
        adminId: 'admin-uuid',
        action: 'SUSPEND_USER',
        details: { targetUserId: 'user-uuid', reason: 'Violação de termos' },
      })

      expect(prisma.adminMarketAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-uuid',
          action: 'SUSPEND_USER',
        }),
      })
    })

    it('deve registrar ação com ticker quando fornecido', async () => {
      const { prisma } = await import('@/lib/prisma')

      await logAdminAction({
        adminId: 'admin-uuid',
        action: 'ARCHIVE_NEWS',
        ticker: 'FLAM4',
      })

      expect(prisma.adminMarketAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ticker: 'FLAM4',
        }),
      })
    })

    it('deve falhar silenciosamente em caso de erro no banco (não quebrar operação principal)', async () => {
      const { prisma } = await import('@/lib/prisma')
      ;(prisma.adminMarketAction.create as jest.Mock).mockRejectedValueOnce(new Error('DB error'))

      // Não deve lançar exceção
      await expect(logAdminAction({
        adminId: 'admin-uuid',
        action: 'RESET_BALANCE',
      })).resolves.not.toThrow()
    })

    it('deve usar ticker: null quando não fornecido', async () => {
      const { prisma } = await import('@/lib/prisma')

      await logAdminAction({
        adminId: 'admin-uuid',
        action: 'SUSPEND_USER',
      })

      expect(prisma.adminMarketAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ticker: null,
        }),
      })
    })

    it('deve incluir details como objeto vazio quando não fornecido', async () => {
      const { prisma } = await import('@/lib/prisma')

      await logAdminAction({
        adminId: 'admin-uuid',
        action: 'UNSUSPEND_USER',
      })

      expect(prisma.adminMarketAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details: {},
        }),
      })
    })
  })
})
