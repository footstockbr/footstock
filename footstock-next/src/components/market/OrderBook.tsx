'use client'

import { useMemo } from 'react'
import { Info } from 'lucide-react'
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
        <span className="inline-block w-2 h-2 rounded-full bg-[#F6465D]" />
        <p className="text-sm text-[#929AA5]">
          Conexão com o mercado perdida. Reconectando...
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-[#F0B90B] underline"
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
          <span className="text-[#929AA5]">Aguardando...</span>
        </div>
        {Array.from({ length: 22 }).map((_, i) => (
          <div key={i} className="h-5 bg-[#2B3139] animate-pulse rounded" />
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
          className="inline-block w-2 h-2 rounded-full bg-[#2EBD85]"
          aria-label="Conectado ao mercado"
        />
        <span className="text-[#929AA5]">Conectado</span>
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
          <tr className="text-[#929AA5]">
            <th scope="col" className="text-left py-1 px-2">
              <span className="inline-flex items-center gap-1">
                Preço (Ask)
                <span title="Precos de venda oferecidos — ask em vermelho (acima) e bid em verde (abaixo)" aria-label="Precos de venda oferecidos" className="cursor-help">
                  <Info className="w-3 h-3 text-[#707A8A]" />
                </span>
              </span>
            </th>
            <th scope="col" className="text-right py-1 px-2">
              <span className="inline-flex items-center gap-1 justify-end">
                Volume
                <span title="Quantidade de acoes disponivel em cada nivel de preco" aria-label="Quantidade de acoes disponivel em cada nivel de preco" className="cursor-help">
                  <Info className="w-3 h-3 text-[#707A8A]" />
                </span>
              </span>
            </th>
            <th scope="col" aria-label="Profundidade" className="w-16" />
          </tr>
        </thead>
        <tbody>
          {/* Asks (descending — melhor ask por último) */}
          {[...asks].reverse().map((row, i) => (
            <tr
              key={`ask-${i}`}
              tabIndex={0}
              className="hover:bg-[#F6465D10] focus:bg-[#F6465D10] cursor-default"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
              }}
            >
              <td className="py-0.5 px-2 text-[#F6465D] font-mono">
                FS${row.price.toFixed(2)}
              </td>
              <td className="py-0.5 px-2 text-right text-[#EAECEF] font-mono">
                {row.volume.toLocaleString('pt-BR')}
              </td>
              <td className="py-0.5 px-2">
                <div
                  className="h-1 bg-[#F6465D] rounded-full"
                  style={{ width: `${((row.volume / maxVol) * 100).toFixed(0)}%` }}
                />
              </td>
            </tr>
          ))}

          {/* Spread row */}
          <tr className="border-y border-[#2B3139]">
            <td colSpan={3} className="text-center text-[#929AA5] text-xs py-1">
              <span className="inline-flex items-center gap-1 justify-center">
                Spread: FS${spread.toFixed(2)} ({spreadPct}%)
                <span title="Diferenca entre o menor preco de venda (ask) e o maior preco de compra (bid) — quanto menor, mais liquido o ativo" aria-label="Diferenca entre ask e bid" className="cursor-help">
                  <Info className="w-3 h-3 text-[#707A8A]" />
                </span>
              </span>
            </td>
          </tr>

          {/* Bids */}
          {bids.map((row, i) => (
            <tr
              key={`bid-${i}`}
              tabIndex={0}
              className="hover:bg-[#2EBD8510] focus:bg-[#2EBD8510] cursor-default"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
              }}
            >
              <td className="py-0.5 px-2 text-[#2EBD85] font-mono">
                FS${row.price.toFixed(2)}
              </td>
              <td className="py-0.5 px-2 text-right text-[#EAECEF] font-mono">
                {row.volume.toLocaleString('pt-BR')}
              </td>
              <td className="py-0.5 px-2">
                <div
                  className="h-1 bg-[#2EBD85] rounded-full"
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
