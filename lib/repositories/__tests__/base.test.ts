// ============================================================================
// Foot Stock — Testes do BaseRepository<T>
// ============================================================================

import { BaseRepository } from '../base'

// ---------------------------------------------------------------------------
// Mock do Prisma delegate
// ---------------------------------------------------------------------------

interface MockUser {
  id: string
  name: string
  email: string
  deletedAt: Date | null
}

function createMockDelegate() {
  return {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BaseRepository', () => {
  let delegate: ReturnType<typeof createMockDelegate>
  let repo: BaseRepository<MockUser>

  beforeEach(() => {
    delegate = createMockDelegate()
    repo = new BaseRepository<MockUser>(delegate, false)
  })

  describe('findById', () => {
    test('retorna registro quando encontrado', async () => {
      const user: MockUser = { id: 'u1', name: 'João', email: 'j@j.com', deletedAt: null }
      delegate.findUnique.mockResolvedValue(user)

      const result = await repo.findById('u1')

      expect(result).toEqual(user)
      expect(delegate.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } })
    })

    test('retorna null quando não encontrado', async () => {
      delegate.findUnique.mockResolvedValue(null)

      const result = await repo.findById('inexistente')

      expect(result).toBeNull()
    })
  })

  describe('findById com soft delete', () => {
    let softRepo: BaseRepository<MockUser>

    beforeEach(() => {
      softRepo = new BaseRepository<MockUser>(delegate, true)
    })

    test('retorna null para registro soft-deleted', async () => {
      const user: MockUser = { id: 'u1', name: 'João', email: 'j@j.com', deletedAt: new Date() }
      delegate.findUnique.mockResolvedValue(user)

      const result = await softRepo.findById('u1')

      expect(result).toBeNull()
    })

    test('retorna registro quando deletedAt é null', async () => {
      const user: MockUser = { id: 'u1', name: 'João', email: 'j@j.com', deletedAt: null }
      delegate.findUnique.mockResolvedValue(user)

      const result = await softRepo.findById('u1')

      expect(result).toEqual(user)
    })
  })

  describe('findMany', () => {
    test('retorna resultado paginado', async () => {
      const users: MockUser[] = [
        { id: 'u1', name: 'João', email: 'j@j.com', deletedAt: null },
        { id: 'u2', name: 'Maria', email: 'm@m.com', deletedAt: null },
      ]
      delegate.findMany.mockResolvedValue(users)
      delegate.count.mockResolvedValue(25)

      const result = await repo.findMany({ page: 2, pageSize: 10 })

      expect(result.items).toHaveLength(2)
      expect(result.meta.page).toBe(2)
      expect(result.meta.totalItems).toBe(25)
      expect(result.meta.totalPages).toBe(3)
      expect(result.meta.hasNextPage).toBe(true)
      expect(result.meta.hasPreviousPage).toBe(true)
    })

    test('retorna página vazia quando page > totalPages', async () => {
      delegate.findMany.mockResolvedValue([])
      delegate.count.mockResolvedValue(5)

      const result = await repo.findMany({ page: 10, pageSize: 10 })

      expect(result.items).toHaveLength(0)
      expect(result.meta.hasNextPage).toBe(false)
    })

    test('aplica scope de soft delete no where', async () => {
      const softRepo = new BaseRepository<MockUser>(delegate, true)
      delegate.findMany.mockResolvedValue([])
      delegate.count.mockResolvedValue(0)

      await softRepo.findMany()

      const findManyArgs = delegate.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }
      expect(findManyArgs.where).toEqual({ deletedAt: null })
    })

    test('usa defaults quando sem params', async () => {
      delegate.findMany.mockResolvedValue([])
      delegate.count.mockResolvedValue(0)

      const result = await repo.findMany()

      expect(result.meta.page).toBe(1)
      expect(result.meta.pageSize).toBe(20) // PAGE_SIZE default
    })
  })

  describe('create', () => {
    test('cria e retorna registro', async () => {
      const user: MockUser = { id: 'u1', name: 'João', email: 'j@j.com', deletedAt: null }
      delegate.create.mockResolvedValue(user)

      const result = await repo.create({ name: 'João', email: 'j@j.com' })

      expect(result).toEqual(user)
      expect(delegate.create).toHaveBeenCalledWith({ data: { name: 'João', email: 'j@j.com' } })
    })
  })

  describe('update', () => {
    test('atualiza e retorna registro', async () => {
      const updated: MockUser = { id: 'u1', name: 'Novo', email: 'j@j.com', deletedAt: null }
      delegate.update.mockResolvedValue(updated)

      const result = await repo.update('u1', { name: 'Novo' })

      expect(result).toEqual(updated)
      expect(delegate.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'Novo' } })
    })
  })

  describe('softDelete', () => {
    test('marca deletedAt quando supportsSoftDelete = true', async () => {
      const softRepo = new BaseRepository<MockUser>(delegate, true)
      const deleted: MockUser = { id: 'u1', name: 'João', email: 'j@j.com', deletedAt: new Date() }
      delegate.update.mockResolvedValue(deleted)

      const result = await softRepo.softDelete('u1')

      expect(result.deletedAt).toBeInstanceOf(Date)
      const updateArgs = delegate.update.mock.calls[0]?.[0] as { data: { deletedAt: Date } }
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date)
    })

    test('lança erro quando supportsSoftDelete = false', async () => {
      await expect(repo.softDelete('u1')).rejects.toThrow('softDelete não suportado')
    })
  })

  describe('hardDelete', () => {
    test('remove fisicamente o registro', async () => {
      delegate.delete.mockResolvedValue({ id: 'u1' })

      await repo.hardDelete('u1')

      expect(delegate.delete).toHaveBeenCalledWith({ where: { id: 'u1' } })
    })
  })

  describe('count', () => {
    test('conta registros', async () => {
      delegate.count.mockResolvedValue(42)

      const result = await repo.count()

      expect(result).toBe(42)
    })

    test('aplica scope de soft delete', async () => {
      const softRepo = new BaseRepository<MockUser>(delegate, true)
      delegate.count.mockResolvedValue(10)

      await softRepo.count()

      expect(delegate.count).toHaveBeenCalledWith({ where: { deletedAt: null } })
    })
  })

  describe('exists', () => {
    test('retorna true quando registro existe', async () => {
      const user: MockUser = { id: 'u1', name: 'João', email: 'j@j.com', deletedAt: null }
      delegate.findUnique.mockResolvedValue(user)

      const result = await repo.exists('u1')

      expect(result).toBe(true)
    })

    test('retorna false quando registro não existe', async () => {
      delegate.findUnique.mockResolvedValue(null)

      const result = await repo.exists('inexistente')

      expect(result).toBe(false)
    })
  })
})
