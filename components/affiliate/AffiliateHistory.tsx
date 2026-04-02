'use client'
// ============================================================================
// Foot Stock — AffiliateHistory
// Tabela paginada de conversões do influenciador afiliado.
// Rastreabilidade: INT-084, US-036, TASK-3/ST004, GAP-004 (auditoria module-25)
// ============================================================================

import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Btn } from '@/components/ui/Btn'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { AffiliateConversion } from '@/types/club'
import { PLAN_LABELS } from '@/lib/constants/labels'

interface PaginationInfo {
  page: number
  totalPages: number
  totalCount: number
  hasNextPage: boolean
}

interface AffiliateHistoryProps {
  conversions: AffiliateConversion[]
  pagination?: PaginationInfo
  onPageChange?: (page: number) => void
  isLoading?: boolean
}

const ptBR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 })

const STATUS_LABELS: Record<AffiliateConversion['status'], string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  PAID: 'Pago',
}

const STATUS_CLASSES: Record<AffiliateConversion['status'], string> = {
  PENDING: 'rounded bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-400',
  PROCESSING: 'rounded bg-blue-900/30 px-2 py-0.5 text-xs text-blue-400',
  PAID: 'rounded bg-green-900/30 px-2 py-0.5 text-xs text-green-400',
}


export function AffiliateHistory({ conversions, pagination, onPageChange, isLoading }: AffiliateHistoryProps) {
  const [currentPage, setCurrentPage] = useState(pagination?.page ?? 1)
  const totalPages = pagination?.totalPages ?? 1

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page)
    onPageChange?.(page)
  }, [onPageChange])

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-5 w-48 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded" />
        ))}
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-zinc-100">Histórico de Conversões</h3>

      {conversions.length === 0 ? (
        <EmptyState title="Nenhuma conversão registrada." description="Compartilhe seu link para começar a ganhar comissões." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm" role="region" aria-label="Histórico de conversões">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th scope="col" className="pb-2 pr-4 text-xs font-medium text-zinc-500">Data</th>
                  <th scope="col" className="pb-2 pr-4 text-xs font-medium text-zinc-500">Plano</th>
                  <th scope="col" className="pb-2 pr-4 text-right text-xs font-medium text-zinc-500">Comissão</th>
                  <th scope="col" className="pb-2 text-xs font-medium text-zinc-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((c, idx) => (
                  <tr key={idx} className="border-b border-white/5 last:border-0">
                    <td className="py-2 pr-4 text-zinc-400">
                      {new Date(c.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2 pr-4 text-zinc-300">{PLAN_LABELS[c.planType]}</td>
                    <td className="py-2 pr-4 text-right text-zinc-200">
                      FS$ {ptBR.format(c.commissionFS)}
                    </td>
                    <td className="py-2">
                      <span className={STATUS_CLASSES[c.status]}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Página anterior"
                aria-disabled={currentPage <= 1}
                className="min-h-[44px] min-w-[44px]"
              >
                <ChevronLeft size={16} />
                <span className="ml-1">Anterior</span>
              </Btn>
              <span className="text-xs text-zinc-500">
                {currentPage} de {totalPages}
              </span>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={!pagination?.hasNextPage}
                aria-label="Próxima página"
                aria-disabled={!pagination?.hasNextPage}
                className="min-h-[44px] min-w-[44px]"
              >
                <span className="mr-1">Próxima</span>
                <ChevronRight size={16} />
              </Btn>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
