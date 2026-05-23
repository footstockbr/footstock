import { NextResponse } from 'next/server'
import type { ApiResponse, ApiListResponse, ApiError, Pagination } from '@/types'

// ─── Respostas de sucesso ──────────────────────────────────────────────────────

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data }, { status })
}

export function created<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data }, { status: 201 })
}

export function list<T>(
  data: T[],
  pagination: Pagination,
  status = 200
): NextResponse<ApiListResponse<T>> {
  return NextResponse.json({ data, pagination }, { status })
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

export function accepted(message: string): NextResponse {
  return NextResponse.json({ message }, { status: 202 })
}

export function message(msg: string, status = 200): NextResponse {
  return NextResponse.json({ message: msg }, { status })
}

// ─── Respostas de erro ─────────────────────────────────────────────────────────

export function error(
  code: string,
  msg: string,
  status: number,
  extra?: Partial<ApiError>
): NextResponse {
  return NextResponse.json(
    { error: { code, message: msg, ...extra } },
    { status }
  )
}

// Wire-format canonico: hifen (AUTH-001) alinhado com ERROR_CODES/ERROR_MESSAGES.
// Tech debt #29 (2026-05-23): consolidou wire underscore (AUTH_001) -> hifen.
// Demais codigos (ADMIN-*, ASSET-*, RATE-*, VAL-*, SYS-*, ORD-*) ja eram hifen.
export const errors = {
  unauthorized: (msg = 'Sessão expirada. Faça login novamente.') =>
    error('AUTH-001', msg, 401),

  forbidden: (msg = 'Acesso negado.', requiredPlan?: string) =>
    error('AUTH-002', msg, 403, requiredPlan ? { requiredPlan } : undefined),

  notFound: (msg = 'Recurso não encontrado.') =>
    error('NOT-FOUND-001', msg, 404),

  conflict: (code: string, msg: string) =>
    error(code, msg, 409),

  validation: (msg = 'Dados inválidos. Verifique os campos e tente novamente.', details?: string) =>
    error('VAL-001', msg, 422, details ? { details } : undefined),

  rateLimit: (msg = 'Limite de requisições atingido. Tente novamente em instantes.', resetAt?: string) =>
    error('RATE-001', msg, 429, resetAt ? { resetAt } : undefined),

  server: (msg = 'Erro interno. Nossa equipe foi notificada.') =>
    error('SYS-001', msg, 500),

  notImplemented: () =>
    error('SYS-002', 'Funcionalidade em desenvolvimento.', 501),
}

// ─── Paginação ─────────────────────────────────────────────────────────────────

export function parsePagination(
  searchParams: URLSearchParams,
  defaultLimit = 20
): { page: number; limit: number; skip: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? String(defaultLimit), 10) || defaultLimit))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

export function buildPagination(
  page: number,
  limit: number,
  total: number
): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return { page, limit, total, totalPages, hasNext: page * limit < total }
}
