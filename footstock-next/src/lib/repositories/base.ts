// ============================================================================
// FootStock — BaseRepository<T> genérico com Prisma
// ============================================================================

import { PAGE_SIZE } from '@/lib/constants/limits'
import type { PaginatedResult, PaginationParams } from '@/types/api'

// ---------------------------------------------------------------------------
// Prisma delegate type (genérico para qualquer model)
// ---------------------------------------------------------------------------

type PrismaDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<unknown>
  findMany: (args: unknown) => Promise<unknown[]>
  count: (args: unknown) => Promise<number>
  create: (args: { data: unknown }) => Promise<unknown>
  update: (args: { where: { id: string }; data: unknown }) => Promise<unknown>
  delete: (args: { where: { id: string } }) => Promise<unknown>
}

/** Entidades que suportam soft delete devem ter este campo */
interface SoftDeletable {
  deletedAt?: Date | null
}

/**
 * BaseRepository genérico com operações CRUD padronizadas.
 * Todos os repositories do projeto devem estender esta classe.
 *
 * Soft delete: quando `supportsSoftDelete = true`, `findMany` e `findById`
 * filtram automaticamente registros com `deletedAt != null`.
 *
 * @example
 * class UserRepository extends BaseRepository<User> {
 *   constructor() { super((prisma as any).user, true) }
 * }
 */
export class BaseRepository<T> {
  protected delegate: PrismaDelegate
  protected supportsSoftDelete: boolean

  constructor(delegate: PrismaDelegate, supportsSoftDelete = false) {
    this.delegate = delegate
    this.supportsSoftDelete = supportsSoftDelete
  }

  /** Scope padrão que exclui registros soft-deleted */
  protected get defaultScope(): Record<string, unknown> {
    return this.supportsSoftDelete ? { deletedAt: null } : {}
  }

  /** Busca por ID — retorna null se não encontrado ou soft-deleted */
  async findById(id: string): Promise<T | null> {
    const result = await this.delegate.findUnique({ where: { id } })
    if (!result) return null
    // Filtrar soft-deleted manualmente (findUnique não aceita where composto no delegate genérico)
    if (this.supportsSoftDelete && (result as SoftDeletable).deletedAt != null) return null
    return result as T
  }

  /** Lista com paginação — exclui soft-deleted automaticamente */
  async findMany(
    params: PaginationParams & { where?: Record<string, unknown>; orderBy?: Record<string, string> } = {}
  ): Promise<PaginatedResult<T>> {
    const { page = 1, pageSize = PAGE_SIZE, where = {}, orderBy } = params
    const skip = (page - 1) * pageSize
    const scopedWhere = { ...this.defaultScope, ...where }

    const [items, total] = await Promise.all([
      this.delegate.findMany({
        where: scopedWhere,
        take: pageSize,
        skip,
        orderBy: orderBy ?? { createdAt: 'desc' },
      }),
      this.delegate.count({ where: scopedWhere }),
    ])

    const totalPages = Math.ceil(total / pageSize)

    return {
      items: items as T[],
      meta: {
        page,
        pageSize,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    }
  }

  /** Cria um novo registro */
  async create(data: Partial<T>): Promise<T> {
    const result = await this.delegate.create({ data })
    return result as T
  }

  /** Atualiza um registro existente */
  async update(id: string, data: Partial<T>): Promise<T> {
    const result = await this.delegate.update({ where: { id }, data })
    return result as T
  }

  /**
   * Soft delete — marca `deletedAt` em vez de remover fisicamente.
   * Disponível apenas quando `supportsSoftDelete = true`.
   * @throws {Error} quando o repositório não suporta soft delete
   */
  async softDelete(id: string): Promise<T> {
    if (!this.supportsSoftDelete) {
      throw new Error('BaseRepository: softDelete não suportado para este model. Use delete().')
    }
    const result = await this.delegate.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return result as T
  }

  /** Hard delete — remove fisicamente o registro */
  async hardDelete(id: string): Promise<void> {
    await this.delegate.delete({ where: { id } })
  }

  /** Conta registros (com scope de soft delete) */
  async count(where?: Record<string, unknown>): Promise<number> {
    const scopedWhere = { ...this.defaultScope, ...(where ?? {}) }
    return this.delegate.count({ where: scopedWhere })
  }

  /** Verifica se um registro existe (e não está soft-deleted) */
  async exists(id: string): Promise<boolean> {
    const result = await this.findById(id)
    return result !== null
  }
}
