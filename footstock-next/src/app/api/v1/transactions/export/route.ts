import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { error, errors } from '@/lib/api'
import { parseTransactionFilters } from '@/lib/contracts/transaction-contract'
import {
  EXPORT_DATA_DENIED_MESSAGE,
  EXPORT_DATA_ERROR_CODE,
  canExportData,
  exportDataDenialExtra,
} from '@/lib/contracts/export-data-gate'
import type { PlanType } from '@/lib/enums'

// hipotese: numeros nao medidos em producao; 366 dias e teto de 10k linhas
// sao limites conservadores para evitar exportacoes pesadas demais antes de
// haver dados reais de uso. Ajustar quando metricas existirem.
const MAX_WINDOW_DAYS = 366
const MAX_EXPORT_ROWS = 10_000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

const CSV_HEADER = [
  'data_execucao',
  'ticker',
  'lado',
  'quantidade',
  'preco_executado',
  'valor_bruto',
  'taxa',
  'valor_liquido',
  'resultado_realizado',
].join(',')

export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { planType: rawPlanType } = auth.user
  if (!canExportData(rawPlanType as PlanType | null)) {
    return error(
      EXPORT_DATA_ERROR_CODE,
      EXPORT_DATA_DENIED_MESSAGE,
      403,
      exportDataDenialExtra(),
    )
  }

  const { searchParams } = request.nextUrl

  // financialType e removido da query ANTES do parser canonico: a exportacao
  // e TRADE-only por contrato, entao qualquer valor (conhecido ou nao) vindo
  // da query deve ser ignorado — nunca validado, nunca rejeitado, nunca
  // honrado. O parser so enxerga type, assetId, from e to.
  const cleanParams = new URLSearchParams(searchParams)
  cleanParams.delete('financialType')

  const parsed = parseTransactionFilters(cleanParams)
  if (!parsed.ok) return errors.validation(parsed.message)

  // Janela efetiva maxima de 366 dias, SEMPRE aplicada:
  // - to ausente na query   → clamp para agora
  // - from ausente na query → clamp para to - 366d (ou agora - 366d)
  // - ambos ausentes        → [agora - 366d, agora]
  // - ambos presentes e span > 366d → 422 (comportamento existente)
  // - so from ou so to      → janela clampada sem rejeicao
  const now = new Date()
  const bothProvided = parsed.filters.from !== null && parsed.filters.to !== null
  const effectiveTo = parsed.filters.to ?? now
  let effectiveFrom = parsed.filters.from

  if (bothProvided) {
    const spanMs = effectiveTo.getTime() - effectiveFrom!.getTime()
    if (spanMs > MAX_WINDOW_DAYS * ONE_DAY_MS) {
      return errors.validation(
        `Período máximo de exportação é ${MAX_WINDOW_DAYS} dias.`,
      )
    }
  } else {
    if (!effectiveFrom) {
      effectiveFrom = new Date(effectiveTo.getTime() - MAX_WINDOW_DAYS * ONE_DAY_MS)
    }
    const spanMs = effectiveTo.getTime() - effectiveFrom.getTime()
    if (spanMs > MAX_WINDOW_DAYS * ONE_DAY_MS) {
      effectiveFrom = new Date(effectiveTo.getTime() - MAX_WINDOW_DAYS * ONE_DAY_MS)
    }
  }

  const filters = {
    ...parsed.filters,
    financialType: 'TRADE' as const,
    from: effectiveFrom,
    to: effectiveTo,
  }

  try {
    const where = {
      userId: auth.user.id,
      financialType: 'TRADE' as const,
      ...(filters.type && { type: filters.type as never }),
      ...(filters.assetId && { assetId: filters.assetId }),
      ...((filters.from || filters.to) && {
        createdAt: {
          ...(filters.from && { gte: filters.from }),
          ...(filters.to && { lt: filters.to }),
        },
      }),
    }

    const txns = await prisma.transaction.findMany({
      where,
      include: {
        asset: { select: { ticker: true } },
        order: { select: { executedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_EXPORT_ROWS,
    })

    const rows = txns.map((tx) => {
      const executedAt = tx.order?.executedAt ?? tx.createdAt
      const ticker = tx.asset?.ticker ?? ''
      const side = tx.side ?? ''
      const quantity = tx.quantity !== null ? String(tx.quantity) : ''
      const price = tx.price !== null ? tx.price.toNumber().toFixed(8) : ''
      const grossAmount =
        tx.quantity !== null && tx.price !== null
          ? (tx.quantity * tx.price.toNumber()).toFixed(2)
          : ''
      const fee = tx.fee !== null ? tx.fee.toNumber().toFixed(8) : ''
      const totalAmount = tx.totalAmount.toNumber().toFixed(2)
      const realizedPnl = tx.realizedPnl !== null ? tx.realizedPnl.toNumber().toFixed(2) : ''

      return [
        executedAt.toISOString(),
        ticker,
        side,
        quantity,
        price,
        grossAmount,
        fee,
        totalAmount,
        realizedPnl,
      ]
        .map(escapeCsvField)
        .join(',')
    })

    const csv = [CSV_HEADER, ...rows].join('\n')
    const dateSuffix = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="transactions_${dateSuffix}.csv"`,
      },
    })
  } catch {
    return errors.server()
  }
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
