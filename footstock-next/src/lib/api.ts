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

export const errors = {
  unauthorized: (msg = 'Sessão expirada. Faça login novamente.') =>
    error('AUTH_001', msg, 401),

  forbidden: (msg = 'Acesso negado.', requiredPlan?: string) =>
    error('AUTH_003', msg, 403, requiredPlan ? { requiredPlan } : undefined),

  notFound: (msg = 'Recurso não encontrado.') =>
    error('NOT_FOUND_001', msg, 404),

  conflict: (code: string, msg: string) =>
    error(code, msg, 409),

  validation: (msg = 'Dados inválidos. Verifique os campos e tente novamente.', details?: string) =>
    error('VAL_001', msg, 422, details ? { details } : undefined),

  rateLimit: (msg = 'Limite de requisições atingido. Tente novamente em instantes.', resetAt?: string) =>
    error('RATE_001', msg, 429, resetAt ? { resetAt } : undefined),

  server: (msg = 'Erro interno. Nossa equipe foi notificada.') =>
    error('SYS_001', msg, 500),

  notImplemented: () =>
    error('SYS_002', 'Funcionalidade em desenvolvimento.', 501),
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
