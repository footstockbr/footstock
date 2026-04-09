'use client'

import { TrendingUp } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/utils/format'
import type { EngagementMetricsDTO } from '@/lib/types/admin'

interface EngagementCardProps {
  data: EngagementMetricsDTO | null
  isLoading: boolean
}

export function EngagementCard({ data, isLoading }: EngagementCardProps) {
  if (isLoading) {
    return (
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#F0B90B]" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '—'
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    if (mins === 0) return `${secs}s`
    return `${mins}m ${secs}s`
  }

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-[#F0B90B]" />
        <h3 className="text-xs font-bold text-[#929AA5] uppercase tracking-wider">Engajamento</h3>
      </div>

      {/* 4 KPIs Grid - como no HTML do cliente */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1.5">ACESSOS/MÊS</p>
          <p style={{ fontSize: '16px', fontWeight: 800, color: '#fff', fontFamily: 'monospace', lineHeight: 1 }}>
            {(data?.MAU ?? 0).toLocaleString('pt-BR')}
          </p>
          <p className="text-[10px] text-[#929AA5] mt-1">sessões únicas</p>
        </div>

        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1.5">TEMPO MÉDIO</p>
          <p style={{ fontSize: '16px', fontWeight: 800, color: '#fff', fontFamily: 'monospace', lineHeight: 1 }}>
            {formatDuration(data?.avgSessionDuration ?? null)}
          </p>
          <p className="text-[10px] text-[#929AA5] mt-1">por acesso</p>
        </div>

        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1.5">RECORRÊNCIA</p>
          <p style={{ fontSize: '16px', fontWeight: 800, color: '#6c63ff', fontFamily: 'monospace', lineHeight: 1 }}>
            {(data?.retentionRate ?? 0).toFixed(0)}%
          </p>
          <p className="text-[10px] text-[#929AA5] mt-1">&gt;1 sessão/dia</p>
        </div>

        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1.5">ACESSOS/USUÁRIO</p>
          <p style={{ fontSize: '16px', fontWeight: 800, color: '#009EE3', fontFamily: 'monospace', lineHeight: 1 }}>
            {data && data.totalUsers > 0 ? (data.MAU / data.totalUsers).toFixed(1) : '0'}×
          </p>
          <p className="text-[10px] text-[#929AA5] mt-1">média no mês</p>
        </div>
      </div>

      {/* DAU/WAU/MAU */}
      <div className="border-t border-[rgba(240,185,11,.08)] pt-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-xs text-[#929AA5] mb-1">DAU</p>
            <p className="text-sm font-bold text-[#EAECEF]">{(data?.DAU ?? 0).toLocaleString('pt-BR')}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#929AA5] mb-1">WAU</p>
            <p className="text-sm font-bold text-[#EAECEF]">{(data?.WAU ?? 0).toLocaleString('pt-BR')}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#929AA5] mb-1">MAU</p>
            <p className="text-sm font-bold text-[#EAECEF]">{(data?.MAU ?? 0).toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </div>

      {/* FS$ Breakdown */}
      {data?.fsBreakdown && (
        <div className="border-t border-[rgba(240,185,11,.08)] pt-4">
          <p className="text-[10px] font-bold text-[#929AA5] uppercase tracking-wider mb-2">
            FS$ Movimentados (30 dias)
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#181A20] rounded p-2">
              <p className="text-[#929AA5]">Compras</p>
              <p className="font-bold text-[#EAECEF]">{formatBRL(data.fsBreakdown.compras)}</p>
            </div>
            <div className="bg-[#181A20] rounded p-2">
              <p className="text-[#929AA5]">Vendas</p>
              <p className="font-bold text-[#EAECEF]">{formatBRL(data.fsBreakdown.vendas)}</p>
            </div>
            <div className="bg-[#181A20] rounded p-2">
              <p className="text-[#929AA5]">Dividendos</p>
              <p className="font-bold text-[#EAECEF]">{formatBRL(data.fsBreakdown.dividendos)}</p>
            </div>
            <div className="bg-[#181A20] rounded p-2">
              <p className="text-[#929AA5]">Taxas</p>
              <p className="font-bold text-[#EAECEF]">{formatBRL(data.fsBreakdown.taxas)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
