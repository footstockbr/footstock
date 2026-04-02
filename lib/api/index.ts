import { NextResponse } from 'next/server'
import { ERROR_CODES, type ErrorCode } from '@/lib/constants/errors'

type PaginationMeta = {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export function ok<T>(data: T, message?: string) {
  return NextResponse.json(
    { success: true, data, ...(message ? { message } : {}) },
    { status: 200 }
  )
}

export function created<T>(data: T, message?: string) {
  return NextResponse.json(
    { success: true, data, ...(message ? { message } : {}) },
    { status: 201 }
  )
}

export function list<T>(items: T[], pagination: PaginationMeta) {
  return NextResponse.json(
    {
      success: true,
      data: items,
      pagination,
    },
    { status: 200 }
  )
}

export function error(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status }
  )
}

export const errors = {
  badRequest(message = 'Requisição inválida.') {
    return error(ERROR_CODES.VAL_001, message, 400)
  },
  unauthorized(message = 'Não autenticado.') {
    return error(ERROR_CODES.AUTH_010, message, 401)
  },
  forbidden(message = 'Sem permissão para esta ação.') {
    return error(ERROR_CODES.AUTH_009, message, 403)
  },
  notFound(message = 'Recurso não encontrado.') {
    return error(ERROR_CODES.SYS_005, message, 404)
  },
  server(message = 'Erro interno do servidor.') {
    return error(ERROR_CODES.SYS_001, message, 500)
  },
}

export function parsePagination(searchParams: URLSearchParams) {
  const pageRaw = Number(searchParams.get('page') ?? 1)
  const limitRaw = Number(searchParams.get('limit') ?? 20)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(Math.floor(limitRaw), 100)
    : 20

  return { page, limit }
}

export function buildPagination(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }
}

export type ApiErrorCode = ErrorCode
