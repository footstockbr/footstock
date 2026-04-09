'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { EngagementMetricsDTO } from '@/lib/types/admin'
import { formatFSValue } from '@/lib/utils/format'

interface EngagementDashboardProps {
  data: EngagementMetricsDTO | null
  isLoading: boolean
}

const ABSENCE_PERIODS = [
  { key: 'd1', label: '1 dia', color: '#f97316' },
  { key: 'd7', label: '7 dias', color: '#f97316' },
  { key: 'd15', label: '15 dias', color: '#F6465D' },
  { key: 'd30', label: '30 dias', color: '#F6465D' },
  { key: 'd30plus', label: '+30d', color: 'rgba(246,70,93,.55)' },
] as const

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (minutes === 0) return `${secs}s`
  return `${minutes}m ${secs}s`
}

const formatFS = formatFSValue

export function EngagementDashboard({ data, isLoading }: EngagementDashboardProps) {
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-4 w-32 mt-4 mb-3" />
          <div className="flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <Skeleton className="h-4 w-48 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const accessesByUser = data.totalUsers > 0 ? (data.MAU / data.totalUsers).toFixed(1) : '0'

  return (
    <div className="space-y-4">
      {/* ACESSOS & SESSÕES Card */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h3 className="text-xs font-bold text-[#929AA5] uppercase tracking-wider mb-4">
          Acessos &amp; Sessões
        </h3>

        {/* 8 KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* ACESSOS/MÊS */}
          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Acessos/Mês</p>
            <p className="text-4xl font-extrabold text-white font-mono leading-none">{data.MAU}</p>
            <p className="text-[10px] text-[#929AA5] mt-1">sessões únicas</p>
          </div>

          {/* TEMPO MÉDIO */}
          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Tempo Médio</p>
            <p className="text-4xl font-extrabold text-white font-mono leading-none">
              {formatDuration(data.avgSessionDuration)}
            </p>
            <p className="text-[10px] text-[#929AA5] mt-1">por acesso</p>
          </div>

          {/* TAXA RECORRÊNCIA */}
          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Taxa Recorrência</p>
            <p className="text-4xl font-extrabold font-mono leading-none" style={{ color: '#6c63ff' }}>
              {data.retentionRate}%
            </p>
            <p className="text-[10px] text-[#929AA5] mt-1">&gt;1 sessão/dia</p>
          </div>

          {/* ACESSOS/USUÁRIO */}
          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Acessos/Usuário</p>
            <p className="text-4xl font-extrabold font-mono leading-none" style={{ color: '#009EE3' }}>
              {accessesByUser}×
            </p>
            <p className="text-[10px] text-[#929AA5] mt-1">média no mês</p>
          </div>

          {/* DAU */}
          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">DAU</p>
            <p className="text-4xl font-extrabold text-white font-mono leading-none">{data.DAU}</p>
            <p className="text-[10px] text-[#929AA5] mt-1">usuários/dia</p>
          </div>

          {/* MAU */}
          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">MAU</p>
            <p className="text-4xl font-extrabold text-white font-mono leading-none">{data.MAU}</p>
            <p className="text-[10px] text-[#929AA5] mt-1">usuários/mês</p>
          </div>

          {/* RETENÇÃO 30d */}
          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Retenção 30d</p>
            <p className="text-4xl font-extrabold font-mono leading-none" style={{ color: '#2EBD85' }}>
              {data.retentionRate}%
            </p>
            <p className="text-[10px] text-[#929AA5] mt-1">voltaram no mês</p>
          </div>

          {/* PICO DE ACESSO */}
          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Pico de Acesso</p>
            <p className="text-2xl font-extrabold text-white font-mono leading-none">
              {data.peakHourRange}
            </p>
            <p className="text-[10px] text-[#929AA5] mt-1">horário mais ativo</p>
          </div>
        </div>

        {/* AUSÊNCIA POR PERÍODO */}
        <div>
          <p className="text-[10px] font-bold text-[#929AA5] uppercase tracking-wider mb-3">
            Ausência por Período
          </p>
          <div className="flex gap-1.5">
            {ABSENCE_PERIODS.map(({ key, label, color }) => {
              const value = data.inactiveByPeriod[key as keyof typeof data.inactiveByPeriod]
              return (
                <div
                  key={key}
                  className="flex-1 bg-[#0B0E11]/50 border border-[rgba(240,185,11,.08)] rounded-lg py-2 px-1 text-center"
                >
                  <p className="text-lg font-extrabold font-mono leading-none" style={{ color }}>
                    {value}
                  </p>
                  <p className="text-[9px] text-[#929AA5] mt-1">{label}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* FS$ MOVIMENTADOS Card */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h3 className="text-xs font-bold text-[#929AA5] uppercase tracking-wider mb-4">
          FS$ Movimentados no Mês
        </h3>

        {/* 4 KPI Grid: Compras, Vendas, Dividendos, Taxas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Compras</p>
            <p className="font-extrabold font-mono leading-none" style={{ fontSize: '13px', color: '#6c63ff' }}>
              FS${formatFS(data.fsBreakdown.compras)}
            </p>
          </div>

          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Vendas</p>
            <p className="font-extrabold font-mono leading-none" style={{ fontSize: '13px', color: '#F6465D' }}>
              FS${formatFS(data.fsBreakdown.vendas)}
            </p>
          </div>

          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Dividendos</p>
            <p className="font-extrabold font-mono leading-none" style={{ fontSize: '13px', color: '#2EBD85' }}>
              FS${formatFS(data.fsBreakdown.dividendos)}
            </p>
          </div>

          <div className="bg-[#181A20] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Taxas</p>
            <p className="font-extrabold font-mono leading-none" style={{ fontSize: '13px', color: '#f97316' }}>
              FS${formatFS(data.fsBreakdown.taxas)}
            </p>
          </div>
        </div>

        {/* Ativo Mais Negociado + Maior P&L */}
        <div className="flex gap-3">
          {/* Ativo Mais Negociado */}
          <div className="flex-1 bg-[#0B0E11]/50 border border-[rgba(240,185,11,.08)] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">
              Ativo Mais Negociado
            </p>
            {data.topAsset ? (
              <>
                <p className="font-extrabold text-white leading-none" style={{ fontSize: '14px' }}>
                  {data.topAsset.ticker}
                </p>
                <p className="text-[9px] text-[#929AA5] font-mono mt-0.5">
                  {data.topAsset.volume.toLocaleString('pt-BR')} cotas
                </p>
              </>
            ) : (
              <p className="text-[9px] text-[#929AA5]">Sem dados</p>
            )}
          </div>

          {/* Maior P&L */}
          <div className="flex-1 bg-[#0B0E11]/50 border border-[rgba(240,185,11,.08)] rounded-lg p-3">
            <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">
              Maior P&amp;L do Mês
            </p>
            {data.topPnlUser ? (
              <>
                <p className="font-extrabold text-white leading-none" style={{ fontSize: '14px' }}>
                  {data.topPnlUser.name}
                </p>
                <p className="text-[9px] font-mono mt-0.5" style={{ color: data.topPnlUser.pnl >= 0 ? '#2EBD85' : '#F6465D' }}>
                  {data.topPnlUser.pnl >= 0 ? '+' : ''}FS${formatFS(Math.abs(data.topPnlUser.pnl))}
                </p>
              </>
            ) : (
              <p className="text-[9px] text-[#929AA5]">Sem dados</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
