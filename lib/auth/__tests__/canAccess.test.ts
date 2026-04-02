// ============================================================================
// Foot Stock — Testes RBAC canAccess
// ============================================================================

import { canAccess, getPermissions, type AdminResource } from '../canAccess'

/** Todos os 24 recursos do sistema */
const ALL_RESOURCES: AdminResource[] = [
  'users:read',
  'users:write',
  'users:suspend',
  'users:delete',
  'assets:read',
  'assets:write',
  'assets:halt',
  'assets:price',
  'motor:read',
  'motor:control',
  'news:read',
  'news:write',
  'news:delete',
  'leagues:read',
  'leagues:moderate',
  'forum:read',
  'forum:moderate',
  'financial:read',
  'financial:write',
  'engagement:read',
  'admin:dashboard',
  'admin:audit',
  'admin:manage',
  'gateway:config',
]

describe('canAccess RBAC', () => {
  describe('SUPER_ADMIN', () => {
    test('acessa todos os 24 recursos', () => {
      for (const resource of ALL_RESOURCES) {
        expect(canAccess('SUPER_ADMIN', resource)).toBe(true)
      }
    })

    test('acessa users:delete', () => {
      expect(canAccess('SUPER_ADMIN', 'users:delete')).toBe(true)
    })

    test('acessa admin:audit', () => {
      expect(canAccess('SUPER_ADMIN', 'admin:audit')).toBe(true)
    })

    test('acessa motor:control', () => {
      expect(canAccess('SUPER_ADMIN', 'motor:control')).toBe(true)
    })

    test('acessa financial:write', () => {
      expect(canAccess('SUPER_ADMIN', 'financial:write')).toBe(true)
    })
  })

  describe('ADMINISTRADOR', () => {
    test('acessa users:write', () => {
      expect(canAccess('ADMINISTRADOR', 'users:write')).toBe(true)
    })

    test('nao acessa users:delete', () => {
      expect(canAccess('ADMINISTRADOR', 'users:delete')).toBe(false)
    })

    test('acessa admin:audit', () => {
      expect(canAccess('ADMINISTRADOR', 'admin:audit')).toBe(true)
    })

    test('acessa motor:control', () => {
      expect(canAccess('ADMINISTRADOR', 'motor:control')).toBe(true)
    })

    test('acessa financial:write (INTAKE: so gateway:config e restrito)', () => {
      expect(canAccess('ADMINISTRADOR', 'financial:write')).toBe(true)
    })

    test('nao acessa admin:manage', () => {
      expect(canAccess('ADMINISTRADOR', 'admin:manage')).toBe(false)
    })

    test('nao acessa gateway:config', () => {
      expect(canAccess('ADMINISTRADOR', 'gateway:config')).toBe(false)
    })
  })

  describe('MONITOR', () => {
    test('pode ler motor', () => {
      expect(canAccess('MONITOR', 'motor:read')).toBe(true)
    })

    test('pode acessar dashboard', () => {
      expect(canAccess('MONITOR', 'admin:dashboard')).toBe(true)
    })

    test('nao pode controlar motor', () => {
      expect(canAccess('MONITOR', 'motor:control')).toBe(false)
    })

    test('nao pode ler usuarios', () => {
      expect(canAccess('MONITOR', 'users:read')).toBe(false)
    })

    test('nao pode ler noticias', () => {
      expect(canAccess('MONITOR', 'news:read')).toBe(false)
    })

    test('nao pode ler financeiro', () => {
      expect(canAccess('MONITOR', 'financial:read')).toBe(false)
    })

    test('acessa apenas dashboard e motor em modo leitura', () => {
      const monitorPerms = getPermissions('MONITOR')
      expect(monitorPerms).toEqual(['admin:dashboard', 'motor:read'])
    })
  })

  describe('EDITOR', () => {
    test('pode escrever noticias', () => {
      expect(canAccess('EDITOR', 'news:write')).toBe(true)
    })

    test('pode deletar noticias', () => {
      expect(canAccess('EDITOR', 'news:delete')).toBe(true)
    })

    test('pode ler noticias', () => {
      expect(canAccess('EDITOR', 'news:read')).toBe(true)
    })

    test('nao pode controlar motor', () => {
      expect(canAccess('EDITOR', 'motor:control')).toBe(false)
    })

    test('nao pode suspender usuarios', () => {
      expect(canAccess('EDITOR', 'users:suspend')).toBe(false)
    })

    test('nao pode moderar forum', () => {
      expect(canAccess('EDITOR', 'forum:moderate')).toBe(false)
    })

    test('pode ler forum', () => {
      expect(canAccess('EDITOR', 'forum:read')).toBe(false)
    })
  })

  describe('MODERADOR', () => {
    test('pode moderar forum', () => {
      expect(canAccess('MODERADOR', 'forum:moderate')).toBe(true)
    })

    test('nao pode moderar ligas', () => {
      expect(canAccess('MODERADOR', 'leagues:moderate')).toBe(false)
    })

    test('pode ler forum', () => {
      expect(canAccess('MODERADOR', 'forum:read')).toBe(true)
    })

    test('nao pode acessar financeiro', () => {
      expect(canAccess('MODERADOR', 'financial:read')).toBe(false)
    })

    test('nao pode escrever noticias', () => {
      expect(canAccess('MODERADOR', 'news:write')).toBe(false)
    })

    test('nao pode ler usuarios', () => {
      expect(canAccess('MODERADOR', 'users:read')).toBe(false)
    })

    test('pode suspender usuarios', () => {
      expect(canAccess('MODERADOR', 'users:suspend')).toBe(true)
    })

    test('pode ler engajamento', () => {
      expect(canAccess('MODERADOR', 'engagement:read')).toBe(true)
    })
  })

  describe('getPermissions', () => {
    test('SUPER_ADMIN retorna 24 permissoes', () => {
      expect(getPermissions('SUPER_ADMIN')).toHaveLength(24)
    })

    test('ADMINISTRADOR retorna 21 permissoes', () => {
      expect(getPermissions('ADMINISTRADOR')).toHaveLength(21)
    })

    test('MONITOR retorna 2 permissoes (dashboard + motor)', () => {
      expect(getPermissions('MONITOR')).toHaveLength(2)
    })

    test('EDITOR retorna 4 permissoes', () => {
      expect(getPermissions('EDITOR')).toHaveLength(4)
    })

    test('MODERADOR retorna 5 permissoes', () => {
      expect(getPermissions('MODERADOR')).toHaveLength(5)
    })
  })
})
