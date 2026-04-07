'use client'

import useSWR from 'swr'
import { Info } from 'lucide-react'
import { useMarketTickTimeout } from '@/hooks/useMarketTickTimeout'

interface BookRow {
  price: number
  quantity: number
}

interface OrderBookSnapshot {
  ticker: string
  lastPrice: number
  isHalted: boolean
  haltReason: string | null
  bids: BookRow[]
  asks: BookRow[]
  spread: number
  spreadPct: number
  orderCount: number
}

async function fetchOrderBook(ticker: string): Promise<OrderBookSnapshot> {
  const res = await fetch(`/api/v1/market/${ticker}/orderbook`)
  if (!res.ok) throw new Error('Erro ao carregar livro de ordens')
  const json = (await res.json()) as { data: OrderBookSnapshot }
  return json.data
}

interface OrderBookProps {
  ticker: string
}

export function OrderBook({ ticker }: OrderBookProps) {
  const { tick, isTimedOut } = useMarketTickTimeout(ticker)

  const { data: book, isLoading } = useSWR<OrderBookSnapshot>(
    ticker,
    () => fetchOrderBook(ticker),
    { refreshInterval: 5_000, revalidateOnFocus: false }
  )

  // Preço ao vivo do SSE; fallback para snapshot do DB
  const livePrice = tick?.lastPrice ?? book?.lastPrice ?? 0

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

  if (isLoading || !book) {
    return (
      <div className="space-y-1 p-2" aria-busy="true" aria-label="Carregando livro de ofertas...">
        <div className="flex items-center gap-1.5 mb-1 text-xs">
          <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b]" />
          <span className="text-[#929AA5]">Carregando...</span>
        </div>
        {Array.from({ length: 22 }).map((_, i) => (
          <div key={i} className="h-5 bg-[#2B3139] animate-pulse rounded" />
        ))}
      </div>
    )
  }

  const bids = book.bids
  const asks = book.asks

  // Volume máximo para normalizar as barras de profundidade
  const maxVol = Math.max(
    ...bids.map((r) => r.quantity),
    ...asks.map((r) => r.quantity),
    1
  )

  const spreadDisplay = book.spread.toFixed(2)
  const spreadPct = book.spreadPct.toFixed(2)

  const isLive = !!tick
  const bestBid = bids[0]?.price ?? livePrice * 0.999
  const bestAsk = asks[0]?.price ?? livePrice * 1.001

  return (
    <div data-testid="order-book">
      {/* Indicador de conexão */}
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs">
        <span
          className={`inline-block w-2 h-2 rounded-full ${isLive ? 'bg-[#2EBD85]' : 'bg-[#f59e0b]'}`}
          aria-label={isLive ? 'Preço ao vivo' : 'Preço do banco de dados'}
        />
        <span className="text-[#929AA5]">
          {isLive ? 'Ao vivo' : 'Última atualização'}
        </span>
        <span className="ml-auto font-mono text-[#EAECEF]">
          FS${livePrice.toFixed(2)}
        </span>
      </div>

      {book.orderCount === 0 ? (
        // Livro vazio — estado válido no início da operação
        <div className="px-2 pb-3 space-y-3">
          <div className="text-center py-4">
            <p className="text-xs text-[#929AA5]">Nenhuma ordem no livro</p>
            <p className="text-[11px] text-[#555e6a] mt-1">
              Ordens LIMIT aparecem aqui quando criadas
            </p>
          </div>
          {/* Exibe spread sintético do motor quando não há ordens */}
          <div className="border-y border-[#2B3139] py-2 text-center text-xs text-[#929AA5]">
            <span className="inline-flex items-center gap-1 justify-center">
              Spread indicativo: FS${(bestAsk - bestBid).toFixed(2)} ({((bestAsk - bestBid) / livePrice * 100).toFixed(2)}%)
              <span
                title="Spread calculado pelo motor quando não há ordens pendentes"
                aria-label="Spread indicativo do motor"
                className="cursor-help"
              >
                <Info className="w-3 h-3 text-[#707A8A]" />
              </span>
            </span>
          </div>
        </div>
      ) : (
        <table
          role="table"
          aria-label={`Livro de ofertas de ${ticker}`}
          className="w-full text-xs"
        >
          <caption className="sr-only">
            Spread atual: FS${spreadDisplay} ({spreadPct}%)
          </caption>
          <thead>
            <tr className="text-[#929AA5]">
              <th scope="col" className="text-left py-1 px-2">
                <span className="inline-flex items-center gap-1">
                  Preço (FS$)
                  <span
                    title="Ask em vermelho (venda) · Bid em verde (compra)"
                    aria-label="Preços de oferta"
                    className="cursor-help"
                  >
                    <Info className="w-3 h-3 text-[#707A8A]" />
                  </span>
                </span>
              </th>
              <th scope="col" className="text-right py-1 px-2">
                <span className="inline-flex items-center gap-1 justify-end">
                  Qtd.
                  <span
                    title="Quantidade de ações disponível em cada nível de preço"
                    aria-label="Quantidade de ações"
                    className="cursor-help"
                  >
                    <Info className="w-3 h-3 text-[#707A8A]" />
                  </span>
                </span>
              </th>
              <th scope="col" aria-label="Profundidade" className="w-16" />
            </tr>
          </thead>
          <tbody>
            {/* Asks — ordem crescente, melhor ask por último */}
            {[...asks].reverse().map((row, i) => (
              <tr
                key={`ask-${i}`}
                tabIndex={0}
                className="hover:bg-[#F6465D10] focus:bg-[#F6465D10] cursor-default"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault() }}
              >
                <td className="py-0.5 px-2 text-[#F6465D] font-mono">
                  {row.price.toFixed(2)}
                </td>
                <td className="py-0.5 px-2 text-right text-[#EAECEF] font-mono">
                  {row.quantity.toLocaleString('pt-BR')}
                </td>
                <td className="py-0.5 px-2">
                  <div
                    className="h-1 bg-[#F6465D] rounded-full"
                    style={{ width: `${((row.quantity / maxVol) * 100).toFixed(0)}%` }}
                  />
                </td>
              </tr>
            ))}

            {/* Spread row */}
            <tr className="border-y border-[#2B3139]">
              <td colSpan={3} className="text-center text-[#929AA5] text-xs py-1">
                <span className="inline-flex items-center gap-1 justify-center">
                  Spread: FS${spreadDisplay} ({spreadPct}%)
                  <span
                    title="Diferença entre o menor ask e o maior bid — quanto menor, mais líquido"
                    aria-label="Spread atual"
                    className="cursor-help"
                  >
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
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault() }}
              >
                <td className="py-0.5 px-2 text-[#2EBD85] font-mono">
                  {row.price.toFixed(2)}
                </td>
                <td className="py-0.5 px-2 text-right text-[#EAECEF] font-mono">
                  {row.quantity.toLocaleString('pt-BR')}
                </td>
                <td className="py-0.5 px-2">
                  <div
                    className="h-1 bg-[#2EBD85] rounded-full"
                    style={{ width: `${((row.quantity / maxVol) * 100).toFixed(0)}%` }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
