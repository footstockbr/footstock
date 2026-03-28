'use client'

import { useMemo } from 'react'
import { useMarketTickTimeout } from '@/hooks/useMarketTickTimeout'

interface BookRow {
  price: number
  volume: number
}

function generateBookSide(basePrice: number, side: 'ask' | 'bid', levels = 10): BookRow[] {
  return Array.from({ length: levels }, (_, i) => {
    const offset = (i + 1) * basePrice * 0.005 // 0.5% por nível
    const price = side === 'ask' ? basePrice + offset : basePrice - offset
    const volume = Math.round(1000 * Math.exp(-i * 0.3))
    return { price, volume }
  })
}

interface OrderBookProps {
  ticker: string
}

export function OrderBook({ ticker }: OrderBookProps) {
  const { tick, isTimedOut } = useMarketTickTimeout(ticker)

  const { asks, bids, spreadPct, maxVol } = useMemo(() => {
    if (!tick) return { asks: [], bids: [], spreadPct: '0.00', maxVol: 1 }
    const asks = generateBookSide(tick.ask, 'ask')
    const bids = generateBookSide(tick.bid, 'bid')
    const spreadPct = ((tick.ask - tick.bid) / tick.bid * 100).toFixed(2)
    const maxVol = Math.max(...asks.map((r) => r.volume), ...bids.map((r) => r.volume), 1)
    return { asks, bids, spreadPct, maxVol }
  }, [tick])

  if (isTimedOut) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
        <span className="inline-block w-2 h-2 rounded-full bg-[#ef4444]" />
        <p className="text-sm text-[#7a7060]">
          Conexão com o mercado perdida. Reconectando...
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-[#C9A84C] underline"
        >
          Reconectar
        </button>
      </div>
    )
  }

  if (!tick) {
    // Skeleton de 22 linhas (waiting for first tick)
    return (
      <div className="space-y-1 p-2" aria-busy="true" aria-label="Carregando livro de ofertas...">
        <div className="flex items-center gap-1.5 mb-1 text-xs">
          <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b]" aria-label="Aguardando dados do mercado" />
          <span className="text-[#7a7060]">Aguardando...</span>
        </div>
        {Array.from({ length: 22 }).map((_, i) => (
          <div key={i} className="h-5 bg-[#2a2010] animate-pulse rounded" />
        ))}
      </div>
    )
  }

  const spread = tick.ask - tick.bid

  return (
    <div data-testid="order-book">
      {/* Connection status badge */}
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs">
        <span
          className="inline-block w-2 h-2 rounded-full bg-[#22c55e]"
          aria-label="Conectado ao mercado"
        />
        <span className="text-[#7a7060]">Conectado</span>
      </div>

      <table
        role="table"
        aria-label={`Livro de ofertas de ${ticker}`}
        className="w-full text-xs"
      >
        <caption className="sr-only">
          Spread atual: FS${spread.toFixed(2)} ({spreadPct}%)
        </caption>
        <thead>
          <tr className="text-[#7a7060]">
            <th scope="col" className="text-left py-1 px-2">Preço (Ask)</th>
            <th scope="col" className="text-right py-1 px-2">Volume</th>
            <th scope="col" aria-label="Profundidade" className="w-16" />
          </tr>
        </thead>
        <tbody>
          {/* Asks (descending — melhor ask por último) */}
          {[...asks].reverse().map((row, i) => (
            <tr
              key={`ask-${i}`}
              tabIndex={0}
              className="hover:bg-[#ef444410] focus:bg-[#ef444410] cursor-default"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
              }}
            >
              <td className="py-0.5 px-2 text-[#ef4444] font-mono">
                FS${row.price.toFixed(2)}
              </td>
              <td className="py-0.5 px-2 text-right text-[#F0EAD6] font-mono">
                {row.volume.toLocaleString('pt-BR')}
              </td>
              <td className="py-0.5 px-2">
                <div
                  className="h-1 bg-[#ef4444] rounded-full"
                  style={{ width: `${((row.volume / maxVol) * 100).toFixed(0)}%` }}
                />
              </td>
            </tr>
          ))}

          {/* Spread row */}
          <tr className="border-y border-[#2a2010]">
            <td colSpan={3} className="text-center text-[#7a7060] text-xs py-1">
              Spread: FS${spread.toFixed(2)} ({spreadPct}%)
            </td>
          </tr>

          {/* Bids */}
          {bids.map((row, i) => (
            <tr
              key={`bid-${i}`}
              tabIndex={0}
              className="hover:bg-[#22c55e10] focus:bg-[#22c55e10] cursor-default"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
              }}
            >
              <td className="py-0.5 px-2 text-[#22c55e] font-mono">
                FS${row.price.toFixed(2)}
              </td>
              <td className="py-0.5 px-2 text-right text-[#F0EAD6] font-mono">
                {row.volume.toLocaleString('pt-BR')}
              </td>
              <td className="py-0.5 px-2">
                <div
                  className="h-1 bg-[#22c55e] rounded-full"
                  style={{ width: `${((row.volume / maxVol) * 100).toFixed(0)}%` }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
