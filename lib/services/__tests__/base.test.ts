// ============================================================================
// Foot Stock — Testes do BaseService
// ============================================================================

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { BaseService, PRISMA_ERROR_MAP } from '../base'
import { AppError } from '@/lib/api/errors'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

// Classe concreta para testar o abstract BaseService
class TestService extends BaseService {
  async run<T>(fn: () => Promise<T>) {
    return this.execute(fn)
  }

  makeError(code: keyof typeof ERROR_CODES) {
    return this.errorResponse(code)
  }

  makeSuccess<T>(data: T) {
    return this.successResponse(data)
  }
}

describe('BaseService', () => {
  let service: TestService

  beforeEach(() => {
    service = new TestService()
  })

  describe('execute', () => {
    test('retorna sucesso quando operação resolve', async () => {
      const result = await service.run(() => Promise.resolve({ id: '1' }))

      expect(result).toEqual({ success: true, data: { id: '1' } })
    })

    test('retorna sucesso com undefined', async () => {
      const result = await service.run(() => Promise.resolve(undefined))

      expect(result).toEqual({ success: true, data: undefined })
    })

    test('converte PrismaClientKnownRequestError P2002 para AUTH_006', async () => {
      const prismaError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      })

      const result = await service.run(() => Promise.reject(prismaError))

      expect(result).toEqual({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_006,
          message: ERROR_MESSAGES[ERROR_CODES.AUTH_006],
        },
      })
    })

    test('converte PrismaClientKnownRequestError P2025 para SYS_005', async () => {
      const prismaError = new PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      })

      const result = await service.run(() => Promise.reject(prismaError))

      expect(result).toEqual({
        success: false,
        error: {
          code: ERROR_CODES.SYS_005,
          message: ERROR_MESSAGES[ERROR_CODES.SYS_005],
        },
      })
    })

    test('converte erro genérico para SYS_001', async () => {
      const genericError = new Error('algo deu errado')

      const result = await service.run(() => Promise.reject(genericError))

      expect(result).toEqual({
        success: false,
        error: {
          code: ERROR_CODES.SYS_001,
          message: 'algo deu errado',
        },
      })
    })

    test('converte AppError corretamente', async () => {
      const appError = new AppError(ERROR_CODES.AUTH_001, 'Credenciais inválidas.')

      const result = await service.run(() => Promise.reject(appError))

      expect(result).toEqual({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_001,
          message: 'Credenciais inválidas.',
        },
      })
    })
  })

  describe('PRISMA_ERROR_MAP', () => {
    test('mapeia P2002 para AUTH_006', () => {
      expect(PRISMA_ERROR_MAP['P2002']).toBe(ERROR_CODES.AUTH_006)
    })

    test('mapeia P2025 para SYS_005', () => {
      expect(PRISMA_ERROR_MAP['P2025']).toBe(ERROR_CODES.SYS_005)
    })

    test('mapeia P2003 para VAL_001', () => {
      expect(PRISMA_ERROR_MAP['P2003']).toBe(ERROR_CODES.VAL_001)
    })
  })

  describe('errorResponse', () => {
    test('retorna resposta de erro formatada', () => {
      const result = service.makeError('AUTH_001')

      expect(result).toEqual({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_001,
          message: ERROR_MESSAGES[ERROR_CODES.AUTH_001],
        },
      })
    })
  })

  describe('successResponse', () => {
    test('retorna resposta de sucesso formatada', () => {
      const result = service.makeSuccess({ name: 'test' })

      expect(result).toEqual({
        success: true,
        data: { name: 'test' },
      })
    })

    test('retorna sucesso com null', () => {
      const result = service.makeSuccess(null)

      expect(result).toEqual({
        success: true,
        data: null,
      })
    })
  })
})
