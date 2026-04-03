'use client'

// ============================================================================
// Foot Stock — OFIPanel
// Indicador de Order Flow Imbalance em tempo real.
// Usa o campo ofi do tick do motor (se disponível) ou deriva de changePercent.
// Disponível para todos os planos.
// ============================================================================

import { cn } from '@/lib/utils/cn'
import { useMarketTick } from '@/hooks/useMarketTick'

export interface OFIPanelProps {
  ticker: string
  className?: string
}

export function OFIPanel({ ticker, className }: OFIPanelProps) {
  const { ticks } = useMarketTick({ tickers: [ticker] })
  const tick = ticks.get(ticker)

  // Usa OFI real do motor (se presente no tick) ou deriva de changePercent como proxy
  const rawOFI = tick?.ofi !== undefined
    ? tick.ofi
    : tick
    ? Math.tanh(tick.changePercent / 5) // proxy suave −1..+1
    : 0

  const ofi = Math.max(-1, Math.min(1, rawOFI))
  const isPositive = ofi >= 0
  const absPct = Math.abs(ofi) * 100
  // Metade da barra (barra cresce a partir do centro)
  const barWidthPct = absPct / 2

  return (
    <div className={cn('flex flex-col gap-2 p-3 rounded-xl bg-[#1E2329]', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#929AA5]">
          OFI — Pressão de Fluxo de Ordens
        </span>
        <span
          className={cn(
            'text-xs font-mono font-bold tabular-nums',
            isPositive ? 'text-[#F0B90B]' : 'text-[#F6465D]'
          )}
          aria-label={`OFI: ${isPositive ? '+' : ''}${(ofi * 100).toFixed(1)}%`}
        >
          {isPositive ? '+' : ''}
          {(ofi * 100).toFixed(1)}%
        </span>
      </div>

      {/* Barra bidirecional centralizada */}
      <div
        role="meter"
        aria-valuenow={Math.round(ofi * 100)}
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-label="Pressão de fluxo de ordens"
        className="relative h-2.5 bg-[#2B3139] rounded-full overflow-hidden"
      >
        {/* Centro */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-[#3B4149] z-10" />

        {/* Barra de pressão */}
        {isPositive ? (
          <div
            className="absolute inset-y-0 left-1/2 bg-[#F0B90B] rounded-r-full transition-all duration-500"
            style={{ width: `${barWidthPct}%` }}
          />
        ) : (
          <div
            className="absolute inset-y-0 right-1/2 bg-[#F6465D] rounded-l-full transition-all duration-500"
            style={{ width: `${barWidthPct}%` }}
          />
        )}
      </div>

      <div className="flex justify-between text-[10px] text-[#929AA5]">
        <span>← Venda</span>
        <span>Compra →</span>
      </div>
    </div>
  )
}
