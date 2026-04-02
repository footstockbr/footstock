// ============================================================================
// Foot Stock — Tratamento padronizado de erros de API
// ============================================================================

import { AxiosError } from 'axios'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import type { ErrorCode } from '@/lib/constants/errors'
import type { ErrorResponse, ApiErrorResponse } from '@/types/api'

// ---------------------------------------------------------------------------
// AppError — erro estruturado da aplicacao
// ---------------------------------------------------------------------------

export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, message?: string, statusCode = 500, details?: Record<string, unknown>) {
    super(message ?? ERROR_MESSAGES[code])
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

// ---------------------------------------------------------------------------
// handleApiError — converte qualquer erro em ErrorResponse padronizado
// ---------------------------------------------------------------------------

/** Converte qualquer erro em ErrorResponse padronizado */
export function handleApiError(error: unknown): ErrorResponse {
  if (error instanceof AxiosError && error.response?.data) {
    const data = error.response.data as ApiErrorResponse
    if (!data.success && data.error) return data.error
  }

  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
    }
  }

  // Prisma P2025 (record not found) → POS_080 (Posição não encontrada)
  if (error instanceof Error) {
    const message = error.message || ''
    if (message.includes('P2025')) {
      return {
        code: ERROR_CODES.POS_080,
        message: ERROR_MESSAGES['POS-080'],
      }
    }

    // Default: SYS_001
    return {
      code: ERROR_CODES.SYS_001,
      message: message || ERROR_MESSAGES['SYS-001'],
    }
  }

  return {
    code: ERROR_CODES.SYS_001,
    message: ERROR_MESSAGES['SYS-001'],
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Verifica se um erro e uma instancia de AppError */
export function isApiError(error: unknown): error is AppError {
  return error instanceof AppError
}

/** Verifica se o status HTTP indica sucesso */
export function isApiSuccess(status: number): boolean {
  return status >= 200 && status < 300
}
