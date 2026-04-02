'use client'

// ============================================================================
// Foot Stock — OrderBookPanel
// Book de ordens sintético (bid/ask) com visualização de profundidade.
// ============================================================================

import { useMemo } from 'react'
import { cn } from '@/lib/utils/cn'
import { Skeleton } from '@/components/ui/Skeleton'
import { useMarketTick } from '@/hooks/useMarketTick'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface OrderBookPanelProps {
  ticker: string
  bid: number
  ask: number
  spread: number
}

interface OrderLevel {
  price: number
  size: number
  total: number
}

// ---------------------------------------------------------------------------
// Gerador de níveis sintéticos
// ---------------------------------------------------------------------------

function generateLevels(
  basePrice: number,
  direction: 'bid' | 'ask',
  count = 10
): OrderLevel[] {
  const levels: OrderLevel[] = []
  let cumTotal = 0

  for (let i = 0; i < count; i++) {
    // Spread aleatório entre 0.05 e 0.15 por nível
    const delta = 0.05 + Math.random() * 0.10
    const price =
      direction === 'bid'
        ? basePrice - delta * (i + 1)
        : basePrice + delta * (i + 1)

    // Tamanho sintético: entre 10 e 500 cotas
    const size = Math.floor(10 + Math.random() * 490)
    cumTotal += size

    levels.push({ price, size, total: cumTotal })
  }

  return levels
}

// ---------------------------------------------------------------------------
// Formato: FS$ 1.234,56
// ---------------------------------------------------------------------------

function fsFmt(value: number): string {
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return `FS$ ${formatted}`
}

function sizeFmt(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

// ---------------------------------------------------------------------------
// Barra de profundidade
// ---------------------------------------------------------------------------

function DepthBar({
  size,
  maxSize,
  side,
}: {
  size: number
  maxSize: number
  side: 'bid' | 'ask'
}) {
  const pct = Math.min((size / maxSize) * 100, 100)
  return (
    <div className="absolute inset-y-0 right-0 h-full" style={{ width: `${pct}%` }}>
      <div
        className={cn(
          'h-full opacity-15 rounded-sm',
          side === 'bid' ? 'bg-[#0ECB81]' : 'bg-[#F6465D]'
        )}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Linha do book
// ---------------------------------------------------------------------------

function BookRow({
  level,
  maxSize,
  side,
}: {
  level: OrderLevel
  maxSize: number
  side: 'bid' | 'ask'
}) {
  return (
    <tr className="relative group hover:bg-[#2B3139]/30 transition-colors">
      <td className="relative py-0.5 pl-2 pr-1 text-xs font-mono text-right w-1/3 z-10">
        <DepthBar size={level.total} maxSize={maxSize} side={side} />
        <span
          className={cn(
            'relative z-10',
            side === 'bid' ? 'text-[#0ECB81]' : 'text-[#F6465D]'
          )}
        >
          {fsFmt(level.price)}
        </span>
      </td>
      <td className="py-0.5 px-1 text-xs text-[#929AA5] text-right w-1/3 font-mono">
        {sizeFmt(level.size)}
      </td>
      <td className="py-0.5 pl-1 pr-2 text-xs text-[#929AA5] text-right w-1/3 font-mono">
        {sizeFmt(level.total)}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function OrderBookPanel({ ticker, bid, ask, spread }: OrderBookPanelProps) {
  const { ticks } = useMarketTick({ tickers: [ticker] })
  const tick = ticks.get(ticker)

  // Usa dados do tick em tempo real se disponíveis, fallback para props
  const liveBid = tick?.price ?? bid
  const liveAsk = liveBid + spread
  const spreadPct = liveBid !== 0 ? (spread / liveBid) * 100 : 0

  // Gera níveis a partir do bid/ask ao vivo (memoizado para não flickar)
  const { askLevels, bidLevels } = useMemo(() => {
    const bids = generateLevels(liveBid, 'bid', 10)
    const asks = generateLevels(liveAsk, 'ask', 10)
    return { bidLevels: bids, askLevels: asks }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(liveBid * 100), Math.round(liveAsk * 100)])

  const maxBidTotal = bidLevels[bidLevels.length - 1]?.total ?? 1
  const maxAskTotal = askLevels[askLevels.length - 1]?.total ?? 1
  const maxTotal = Math.max(maxBidTotal, maxAskTotal)

  if (!tick && bid === 0 && ask === 0) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 22 }).map((_, i) => (
          <Skeleton key={i} className="w-full h-5 rounded" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0" aria-label={`Book de ordens para ${ticker}`}>
      {/* Cabeçalho */}
      <table
        role="table"
        className="w-full border-collapse"
        aria-label="Book de ordens — Vendas (Ask)"
      >
        <thead>
          <tr className="border-b border-[#2B3139]">
            <th scope="col" className="py-1.5 pl-2 pr-1 text-xs text-[#929AA5] text-right w-1/3">
              Preço
            </th>
            <th scope="col" className="py-1.5 px-1 text-xs text-[#929AA5] text-right w-1/3">
              Qtd
            </th>
            <th scope="col" className="py-1.5 pl-1 pr-2 text-xs text-[#929AA5] text-right w-1/3">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Asks — em ordem decrescente (mais alto primeiro) */}
          {[...askLevels].reverse().map((level, i) => (
            <BookRow key={`ask-${i}`} level={level} maxSize={maxTotal} side="ask" />
          ))}
        </tbody>
      </table>

      {/* Spread */}
      <div className="flex items-center justify-center gap-2 py-2 border-y border-[#2B3139] bg-[#181A20]">
        <span className="text-xs text-[#929AA5]">Spread:</span>
        <span className="text-xs font-mono text-[#EAECEF] font-medium">
          {fsFmt(spread)} ({spreadPct.toFixed(2)}%)
        </span>
      </div>

      {/* Bids */}
      <table
        role="table"
        className="w-full border-collapse"
        aria-label="Book de ordens — Compras (Bid)"
      >
        <tbody>
          {bidLevels.map((level, i) => (
            <BookRow key={`bid-${i}`} level={level} maxSize={maxTotal} side="bid" />
          ))}
        </tbody>
      </table>
    </div>
  )
}
