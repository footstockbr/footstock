'use client'

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface AssetRow {
  id: string
  ticker: string
  displayName: string
  division: string
  currentPrice: number
  fairValue: number
  priceChange: number
  volume24h: number
  isHalted: boolean
  haltReason: string | null
  sentiment: string
  updatedAt: string
}

async function fetchAllAssets(): Promise<AssetRow[]> {
  const res = await fetch('/api/v1/admin/assets')
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

const SENTIMENT_LABEL: Record<string, { label: string; color: string }> = {
  BULLISH: { label: 'Bullish', color: '#2EBD85' },
  BEARISH: { label: 'Bearish', color: '#F6465D' },
  NEUTRAL: { label: 'Neutro', color: '#929AA5' },
}

/**
 * AssetsTable — tabela com todos os 40 ativos do motor.
 * Colunas: ticker, preço atual, desvio FV%, OFI, volume 24h, sentimento, halt status.
 * Atualiza a cada 15s (spec §Módulo 2 — "atualiza em tempo real").
 */
export function AssetsTable() {
  const { data: assets, isLoading, error } = useQuery({
    queryKey: ['admin-assets-full'],
    queryFn: fetchAllAssets,
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  if (isLoading) {
    return (
      <div data-testid="admin-motor-assets-table" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h3 className="text-sm font-semibold text-[#EAECEF] mb-3">Ativos — visão geral</h3>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="admin-motor-assets-table" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <p className="text-xs text-[#F6465D]">Erro ao carregar ativos</p>
      </div>
    )
  }

  const halted = (assets ?? []).filter((a) => a.isHalted).length

  return (
    <div data-testid="admin-motor-assets-table" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#EAECEF]">
          Ativos — visão geral
          <span className="ml-2 text-[11px] font-normal text-[#929AA5]">
            {assets?.length ?? 0} ativos
          </span>
        </h3>
        {halted > 0 && (
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
            {halted} suspenso{halted > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]" aria-label="Todos os ativos">
          <thead>
            <tr className="border-b border-[rgba(240,185,11,.08)] text-[#929AA5]">
              <th className="text-left py-2 px-2 font-medium">Ticker</th>
              <th className="text-right py-2 px-2 font-medium">Preço atual</th>
              <th className="text-right py-2 px-2 font-medium">Desvio FV%</th>
              <th className="text-right py-2 px-2 font-medium">OFI</th>
              <th className="text-right py-2 px-2 font-medium">Volume 24h</th>
              <th className="text-center py-2 px-2 font-medium">Sentimento</th>
              <th className="text-center py-2 px-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(assets ?? []).map((asset) => {
              const deviationColor = asset.priceChange > 0 ? '#2EBD85' : asset.priceChange < 0 ? '#F6465D' : '#929AA5'
              const sentimentMeta = SENTIMENT_LABEL[asset.sentiment] ?? SENTIMENT_LABEL.NEUTRAL

              return (
                <tr
                  key={asset.id}
                  className={cn(
                    'border-b border-[rgba(240,185,11,.04)] last:border-0',
                    asset.isHalted ? 'bg-red-900/5' : 'hover:bg-[rgba(240,185,11,.02)]'
                  )}
                >
                  <td className="py-2 px-2">
                    <div className="font-mono font-semibold text-[#c5b99a]">{asset.ticker}</div>
                    <div className="text-[10px] text-[#707A8A] truncate max-w-[120px]">{asset.displayName}</div>
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-[#EAECEF]">
                    FS${asset.currentPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-2 text-right font-medium" style={{ color: deviationColor }}>
                    {asset.priceChange > 0 ? '+' : ''}{asset.priceChange.toFixed(2)}%
                  </td>
                  <td className="py-2 px-2 text-right text-[#929AA5]">
                    —
                  </td>
                  <td className="py-2 px-2 text-right text-[#929AA5]">
                    {asset.volume24h.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className="text-[11px] font-medium" style={{ color: sentimentMeta.color }}>
                      {sentimentMeta.label}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    {asset.isHalted ? (
                      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                        HALT
                      </span>
                    ) : (
                      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
