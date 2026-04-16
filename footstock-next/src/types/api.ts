// ============================================================================
// FootStock — API Response Types
// ============================================================================

import { ERROR_CODES } from '@/lib/constants/errors';

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ---------------------------------------------------------------------------
// ST002: Tipos de resposta da API
// ---------------------------------------------------------------------------

/** Resposta de sucesso genérica da API */
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/** Erro estruturado com código de erro da plataforma */
export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  field?: string;
}

/** Resposta de erro da API */
export interface ApiErrorResponse {
  success: false;
  error: ErrorResponse;
  errors?: ErrorResponse[];
}

/** Metadados de paginação */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Resultado paginado genérico */
export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Parâmetros de paginação para requisições */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Resultado discriminado da API (sucesso ou erro) */
export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;
