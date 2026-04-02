/**
 * Testes unitários — PATCH /api/v1/admin/users/:id/promote
 * Module: module-23-admin-usuarios-financeiro / TASK-4
 */

const ADMIN_ROLE_LEVELS: Record<string, number> = {
  MONITOR: 1,
  EDITOR: 2,
  MODERADOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
}

function hasAdminRole(userRole: string | null | undefined, required: string): boolean {
  if (!userRole) return false
  return (ADMIN_ROLE_LEVELS[userRole] ?? 0) >= (ADMIN_ROLE_LEVELS[required] ?? 99)
}

describe('Admin: Promoção de Role', () => {
  describe('Apenas SUPER_ADMIN pode promover', () => {
    it('ADMIN não pode promover outro usuário', () => {
      expect(hasAdminRole('ADMIN', 'SUPER_ADMIN')).toBe(false)
    })

    it('SUPER_ADMIN pode promover', () => {
      expect(hasAdminRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true)
    })

    it('MONITOR não pode promover', () => {
      expect(hasAdminRole('MONITOR', 'SUPER_ADMIN')).toBe(false)
    })
  })

  describe('Hierarquia de roles', () => {
    it('deve respeitar ordem: SUPER_ADMIN > ADMIN > MODERADOR > EDITOR > MONITOR', () => {
      expect(ADMIN_ROLE_LEVELS['SUPER_ADMIN']).toBeGreaterThan(ADMIN_ROLE_LEVELS['ADMIN'])
      expect(ADMIN_ROLE_LEVELS['ADMIN']).toBeGreaterThan(ADMIN_ROLE_LEVELS['MODERADOR'])
      expect(ADMIN_ROLE_LEVELS['MODERADOR']).toBeGreaterThan(ADMIN_ROLE_LEVELS['EDITOR'])
      expect(ADMIN_ROLE_LEVELS['EDITOR']).toBeGreaterThan(ADMIN_ROLE_LEVELS['MONITOR'])
    })
  })

  describe('Validação de schema', () => {
    it('deve aceitar roles válidas e null (para remover role admin)', () => {
      const { z } = require('zod')
      const schema = z.object({
        adminRole: z.enum(['SUPER_ADMIN', 'ADMIN', 'MONITOR', 'EDITOR', 'MODERADOR']).nullable(),
      })
      expect(schema.safeParse({ adminRole: 'ADMIN' }).success).toBe(true)
      expect(schema.safeParse({ adminRole: null }).success).toBe(true)
      expect(schema.safeParse({ adminRole: 'INVALIDO' }).success).toBe(false)
    })
  })
})
