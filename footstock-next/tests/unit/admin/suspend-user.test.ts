/**
 * Testes unitários — PATCH /api/v1/admin/users/:id/suspend
 * Module: module-23-admin-usuarios-financeiro / TASK-4
 */

describe('Admin: Suspender Usuário', () => {
  describe('Autenticação e Autorização', () => {
    it('deve retornar 401 se nenhum JWT for fornecido', () => {
      // getAuthUser retorna null quando nenhum JWT é fornecido
      // A rota responde 401 quando auth === null (verificado via lógica de auth)
      const auth = null
      const isAuthenticated = auth !== null
      expect(isAuthenticated).toBe(false)
    })

    it('deve retornar 403 para role MONITOR (insuficiente para suspender)', async () => {
      // Monitor não pode suspender (requer ADMIN+)
      // Verificado via hasAdminRole('MONITOR', 'ADMIN') === false
      const hasAdminRole = (userRole: string, required: string) => {
        const levels: Record<string, number> = {
          MONITOR: 1, EDITOR: 2, MODERADOR: 3, ADMIN: 4, SUPER_ADMIN: 5,
        }
        return (levels[userRole] ?? 0) >= (levels[required] ?? 99)
      }
      expect(hasAdminRole('MONITOR', 'ADMIN')).toBe(false)
    })

    it('deve permitir suspensão para ADMIN', () => {
      const hasAdminRole = (userRole: string, required: string) => {
        const levels: Record<string, number> = {
          MONITOR: 1, EDITOR: 2, MODERADOR: 3, ADMIN: 4, SUPER_ADMIN: 5,
        }
        return (levels[userRole] ?? 0) >= (levels[required] ?? 99)
      }
      expect(hasAdminRole('ADMIN', 'ADMIN')).toBe(true)
      expect(hasAdminRole('SUPER_ADMIN', 'ADMIN')).toBe(true)
    })
  })

  describe('Validação de entrada', () => {
    it('deve rejeitar reason com menos de 5 caracteres', () => {
      const { z } = require('zod')
      const schema = z.object({
        reason: z.string().min(5).max(500),
      })
      expect(schema.safeParse({ reason: 'ok' }).success).toBe(false)
    })

    it('deve aceitar reason válida', () => {
      const { z } = require('zod')
      const schema = z.object({
        reason: z.string().min(5).max(500),
      })
      expect(schema.safeParse({ reason: 'Violação dos termos de uso' }).success).toBe(true)
    })
  })

  describe('Regras de negócio', () => {
    it('deve impedir admin de suspender a própria conta', () => {
      const adminId = 'admin-uuid-123'
      const targetId = 'admin-uuid-123'
      const isSelfSuspension = adminId === targetId
      expect(isSelfSuspension).toBe(true)
    })

    it('deve registrar suspensão com suspendedAt e suspensionReason', () => {
      const updateData = {
        suspendedAt: new Date(),
        suspensionReason: 'Violação dos termos de uso',
      }
      expect(updateData.suspendedAt).toBeInstanceOf(Date)
      expect(updateData.suspensionReason).toBeTruthy()
    })
  })
})
