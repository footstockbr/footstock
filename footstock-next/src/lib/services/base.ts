// ============================================================================
// FootStock — BaseService com error handling padronizado
// ============================================================================

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import type { ErrorCode } from '@/lib/constants/errors'

function handleApiError(_error: unknown): { code: ErrorCode; message: string } {
  return { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES[ERROR_CODES.SYS_001] }
}
import type { ApiResponse, ApiErrorResponse, ErrorResponse } from '@/types/api'

type ServiceResult<T> = ApiResponse<T> | ApiErrorResponse

/**
 * Mapa de códigos de erro Prisma para códigos do ERROR-CATALOG.
 * P2002 = unique constraint, P2025 = record not found, etc.
 */
const PRISMA_ERROR_MAP: Record<string, ErrorCode> = {
  P2002: ERROR_CODES.AUTH_006,  // Registro duplicado (ex: e-mail já cadastrado)
  P2025: ERROR_CODES.SYS_001,  // Registro não encontrado
  P2003: ERROR_CODES.VAL_001,  // Foreign key constraint
  P2014: ERROR_CODES.SYS_001,  // Relação inválida
}

/**
 * Converte PrismaClientKnownRequestError para ErrorResponse do ERROR-CATALOG.
 * Garante que erros de banco nunca vazem detalhes internos para o cliente.
 */
function handlePrismaError(error: PrismaClientKnownRequestError): ErrorResponse {
  const code = PRISMA_ERROR_MAP[error.code] ?? ERROR_CODES.SYS_001
  return {
    code,
    message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES[ERROR_CODES.SYS_001],
  }
}

/**
 * BaseService com wrapper de error handling padronizado.
 * Converte PrismaClientKnownRequestError → AppError (ERROR-CATALOG)
 * antes de propagar, garantindo que erros internos do banco não vazem.
 */
export abstract class BaseService {
  /** Executa uma operação com error handling padronizado */
  protected async execute<T>(
    operation: () => Promise<T>
  ): Promise<ServiceResult<T>> {
    try {
      const data = await operation()
      return { success: true, data }
    } catch (error) {
      // Tratar erros Prisma com mapeamento para ERROR-CATALOG
      if (error instanceof PrismaClientKnownRequestError) {
        return { success: false, error: handlePrismaError(error) }
      }
      const errorResponse = handleApiError(error)
      return { success: false, error: errorResponse }
    }
  }

  /** Cria resposta de erro padronizada */
  protected errorResponse(code: keyof typeof ERROR_CODES): ApiErrorResponse {
    const codeValue = ERROR_CODES[code]
    return {
      success: false,
      error: {
        code: codeValue,
        message: ERROR_MESSAGES[codeValue],
      },
    }
  }

  /** Cria resposta de sucesso padronizada */
  protected successResponse<T>(data: T): ApiResponse<T> {
    return { success: true, data }
  }
}

export { PRISMA_ERROR_MAP, handlePrismaError }
