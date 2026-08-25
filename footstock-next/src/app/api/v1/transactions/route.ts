import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, parsePagination, buildPagination } from '@/lib/api'
import {
  serializeTransaction,
  buildTransactionMeta,
  buildTransactionFiltersMeta,
  parseTransactionFilters,
} from '@/lib/contracts/transaction-contract'

// GET /api/v1/transactions
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  // Relatorio do jogador pede ate 200 linhas (Task 18). O cap global permanece 100.
  const { page, limit, skip } = parsePagination(searchParams, 20, 200)

  // Validacao unica dos filtros (tipo, tipo financeiro, ativo e periodo).
  // Erro aqui e sempre 422/VAL-001: o pedido chegou bem formado em HTTP, o que
  // esta errado e o conteudo do filtro.
  const parsed = parseTransactionFilters(searchParams)
  if (!parsed.ok) return errors.validation(parsed.message)
  const filters = parsed.filters

  try {
    const where = {
      userId: auth.user.id,
      ...(filters.type && { type: filters.type as never }),
      ...(filters.financialType && { financialType: filters.financialType as never }),
      ...(filters.assetId && { assetId: filters.assetId }),
      // `from` inclusivo (gte) e `to` exclusivo (lt): o extrato de um dia inteiro
      // nao depende de acertar o ultimo milissegundo da virada.
      ...((filters.from || filters.to) && {
        createdAt: {
          ...(filters.from && { gte: filters.from }),
          ...(filters.to && { lt: filters.to }),
        },
      }),
    }

    const [txns, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          asset: { select: { id: true, ticker: true, displayName: true } },
          order: { select: { id: true, type: true, executedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])

    const serialized = txns.map(serializeTransaction)
    const meta = {
      ...buildTransactionMeta(serialized),
      filters: buildTransactionFiltersMeta(filters),
    }

    return NextResponse.json(
      {
        data: serialized,
        pagination: buildPagination(page, limit, total),
        meta,
      },
      { status: 200 }
    )
  } catch {
    return errors.server()
  }
}
