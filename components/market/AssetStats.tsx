'use client'

// ============================================================================
// Foot Stock — AssetStats
// Fundamentals/estatísticas de um ativo: cap, volume, abertura, fechamento.
// ============================================================================

import { cn } from '@/lib/utils/cn'
import { formatFS } from '@/lib/utils/formatCurrency'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface AssetStatsData {
  marketCap: number
  currentPrice: number
  openPrice: number
  closePrice: number
  volume: number
  ticker: string
}

export interface AssetStatsProps {
  asset: AssetStatsData | null
  className?: string
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

function fsCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `FS$ ${(value / 1_000_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`
  }
  if (value >= 1_000_000) {
    return `FS$ ${(value / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
  }
  if (value >= 1_000) {
    return `FS$ ${(value / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`
  }
  return formatFS(value)
}

function fsVolume(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M cotas`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}K cotas`
  }
  return `${value.toLocaleString('pt-BR')} cotas`
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string
  value: string
  tooltip: string
  valueClassName?: string
}

function StatCard({ label, value, tooltip, valueClassName }: StatCardProps) {
  return (
    <div
      title={tooltip}
      className="flex flex-col gap-1 bg-[#1E2329] rounded-xl p-3 cursor-help"
    >
      <span className="text-xs text-[#929AA5] font-medium">{label}</span>
      <span className={cn('text-sm font-mono font-semibold text-[#EAECEF]', valueClassName)}>
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function AssetStats({ asset, className }: AssetStatsProps) {
  if (!asset) {
    return (
      <div className={cn('text-center py-8', className)}>
        <p className="text-sm text-[#929AA5]">Dados não disponíveis.</p>
      </div>
    )
  }

  const change = asset.currentPrice - asset.closePrice
  const changePercent =
    asset.closePrice !== 0 ? (change / asset.closePrice) * 100 : 0
  const isPositive = change >= 0

  const changeFormatted = `${isPositive ? '+' : ''}${formatFS(change)} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)`

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', className)}>
      <StatCard
        label="Market Cap"
        value={fsCompact(asset.marketCap)}
        tooltip="Capitalização de mercado total do ativo (preço atual × total de cotas emitidas)"
      />
      <StatCard
        label="Volume 24h"
        value={fsVolume(asset.volume)}
        tooltip="Volume total negociado nas últimas 24 horas"
      />
      <StatCard
        label="Preço Abertura"
        value={formatFS(asset.openPrice)}
        tooltip="Preço de abertura do pregão atual"
      />
      <StatCard
        label="Preço Fechamento"
        value={formatFS(asset.closePrice)}
        tooltip="Preço de fechamento do último pregão"
      />
      <StatCard
        label="Variação 24h"
        value={changeFormatted}
        tooltip="Variação absoluta e percentual em relação ao fechamento anterior"
        valueClassName={
          isPositive ? 'text-[#0ECB81]' : 'text-[#F6465D]'
        }
      />
      <StatCard
        label="Preço Atual"
        value={formatFS(asset.currentPrice)}
        tooltip="Último preço negociado em tempo real (ou com delay conforme plano)"
      />
    </div>
  )
}
