'use client'

// ============================================================================
// FootStock — LeveragedPositionRow
// Linha de posição LONG alavancada no Portfolio Dashboard.
// Exibe badge "2x", crédito utilizado, juros acumulados e P&L líquido.
// Rastreabilidade: T-003 / INT-TRD-005
// ============================================================================

import { TrendingUp, TrendingDown, Zap } from 'lucide-react'

interface LeveragedPositionRowProps {
  ticker: string
  quantity: number
  avgPrice: number
  currentPrice: number
  leverageAmount: number
  interestAccrued: number
  pnl: number
  pnlPercent: number
}

export function LeveragedPositionRow({
  ticker,
  quantity,
  avgPrice,
  currentPrice,
  leverageAmount,
  interestAccrued,
  pnl,
  pnlPercent,
}: LeveragedPositionRowProps) {
  const isPositive = pnl >= 0
  // P&L liquido = variacao de preco - juros acumulados
  const pnlLiquido = pnl - interestAccrued
  const isPnlLiquidoPositive = pnlLiquido >= 0

  return (
    <div
      className="rounded-lg border border-[rgba(240,185,11,.25)] bg-[rgba(240,185,11,.04)] p-3 space-y-2"
      data-testid={`leveraged-position-row-${ticker}`}
      role="row"
      aria-label={`Posição alavancada ${ticker}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#EAECEF] text-base">{ticker}</span>
          {/* Badge 2x */}
          <span
            className="inline-flex items-center gap-0.5 rounded-full bg-[rgba(240,185,11,.2)] px-1.5 py-0.5 text-[10px] font-semibold text-[#F0B90B]"
            aria-label="Posição alavancada 2x"
          >
            <Zap className="h-2.5 w-2.5" aria-hidden="true" />
            2x
          </span>
        </div>

        {/* P&L variacao de preco */}
        <div className="flex items-center gap-1">
          {isPositive ? (
            <TrendingUp className="h-3.5 w-3.5 text-[#2EBD85]" aria-hidden="true" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-[#F6465D]" aria-hidden="true" />
          )}
          <span
            className={`text-sm font-mono font-medium ${
              isPositive ? 'text-[#2EBD85]' : 'text-[#F6465D]'
            }`}
          >
            {isPositive ? '+' : ''}
            {pnlPercent.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Detalhes da posição */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between text-[#929AA5]">
          <span>Quantidade:</span>
          <span className="font-mono text-[#EAECEF]">{quantity}</span>
        </div>
        <div className="flex justify-between text-[#929AA5]">
          <span>Preço médio:</span>
          <span className="font-mono text-[#EAECEF]">FS$ {avgPrice.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[#929AA5]">
          <span>Preço atual:</span>
          <span className="font-mono text-[#EAECEF]">FS$ {currentPrice.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[#929AA5]">
          <span>Crédito utilizado:</span>
          <span className="font-mono text-[#F0B90B]">FS$ {leverageAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Juros e P&L líquido */}
      <div className="border-t border-[rgba(240,185,11,.15)] pt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between text-[#929AA5]">
          <span>Juros acumulados:</span>
          <span className="font-mono text-[#F6465D]">
            {interestAccrued > 0 ? `-FS$ ${interestAccrued.toFixed(4)}` : 'FS$ 0,00'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#929AA5]">P&L líquido:</span>
          <span
            className={`font-mono font-medium ${
              isPnlLiquidoPositive ? 'text-[#2EBD85]' : 'text-[#F6465D]'
            }`}
          >
            {isPnlLiquidoPositive ? '+' : ''}
            FS$ {pnlLiquido.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}
