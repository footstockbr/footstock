'use client'

import { cn } from '@/lib/utils'
import { formatFS, formatDateTime } from '@/lib/utils/format'

export interface ExtratoTransaction {
  id: string
  orderId?: string | null
  assetId?: string | null
  type?: string | null
  financialType: string
  side?: string | null
  quantity?: number | null
  price?: number | null
  fee?: number | null
  totalAmount: number
  fsAmount?: number | null
  createdAt: string
  // Relações enriquecidas (Task 15)
  ticker?: string | null
  displayName?: string | null
  executedAt?: string
  orderType?: string | null
  timestampSource?: 'ORDER_EXECUTED_AT' | 'TRANSACTION_CREATED_AT'
  // Campos financeiros canonicos (Task 15)
  grossAmount?: number | null
  cashDelta?: number | null
}

const FINANCIAL_TYPE_CONFIG: Record<string, { label: string; colorClass: string }> = {
  TRADE:            { label: 'Negociação',        colorClass: '' },
  FEE:              { label: 'Taxa Operacional',   colorClass: 'text-[#F0B90B]' },
  BONUS:            { label: 'Bônus',              colorClass: 'text-[#2EBD85]' },
  DEPOSIT:          { label: 'Depósito',           colorClass: 'text-[#2EBD85]' },
  WITHDRAWAL:       { label: 'Saque',              colorClass: 'text-[#F6465D]' },
  SHORT_INTEREST:   { label: 'Juros Short',        colorClass: 'text-[#F6465D]' },
  MARGIN_BLOCKED:   { label: 'Margem Bloqueada',   colorClass: 'text-[#929AA5]' },
  SHORT_CLOSE:      { label: 'Fechamento Short',   colorClass: 'text-[#2EBD85]' },
  LEVERAGE_INTEREST:{ label: 'Juros Alavancagem',  colorClass: 'text-[#F6465D]' },
}

const SIDE_COLORS: Record<string, string> = {
  BUY:  'text-[#2EBD85]',
  SELL: 'text-[#F6465D]',
}

const SIDE_LABELS: Record<string, string> = {
  BUY:  'Compra',
  SELL: 'Venda',
}

const TYPE_LABELS: Record<string, string> = {
  MARKET:      'Mercado',
  LIMIT:       'Limitada',
  STOP_LOSS:   'Stop Loss',
  TAKE_PROFIT: 'Take Profit',
  OCO:         'OCO',
  SCHEDULED:   'Agendada',
}

interface ExtratoItemProps {
  transaction: ExtratoTransaction
}

function safeNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return value
}

function formatOrFallback(value: number | null | undefined): string {
  const n = safeNumber(value)
  return n === null ? '—' : formatFS(n)
}

export function ExtratoItem({ transaction: tx }: ExtratoItemProps) {
  const config = FINANCIAL_TYPE_CONFIG[tx.financialType] ?? { label: tx.financialType, colorClass: '' }
  const isFee   = tx.financialType === 'FEE'
  const isTrade = tx.financialType === 'TRADE'
  const isBonus = tx.financialType === 'BONUS'
  const sideKey = tx.side ?? ''

  const label = isTrade && sideKey
    ? SIDE_LABELS[sideKey] ?? sideKey
    : config.label

  const colorClass = isTrade && sideKey
    ? SIDE_COLORS[sideKey] ?? 'text-[#EAECEF]'
    : config.colorClass || 'text-[#929AA5]'

  const title = tx.ticker
    ? `${tx.ticker}${tx.displayName ? ` — ${tx.displayName}` : ''}`
    : tx.displayName ?? label

  const cashDelta = safeNumber(tx.cashDelta)
  const totalDebitCredit = cashDelta !== null ? Math.abs(cashDelta) : safeNumber(tx.totalAmount)

  return (
    <div
      className={cn(
        'bg-[#1E2329] rounded-lg border p-4',
        isFee
          ? 'border-[rgba(240,185,11,.3)] bg-[rgba(240,185,11,.04)]'
          : 'border-[rgba(240,185,11,.18)]'
      )}
      data-testid={isFee ? 'extrato-fee-item' : isBonus ? 'extrato-bonus-item' : 'extrato-trade-item'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Linha principal: ticker/nome + lado/tipo */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span data-testid="extrato-asset-ticker" className={cn('text-sm font-bold', colorClass)}>
              {title}
            </span>
            <span className="text-xs font-medium text-[#929AA5]">
              {label}
            </span>
            {isTrade && tx.orderType && (
              <span className="text-xs text-[#707A8A]">{TYPE_LABELS[tx.orderType] ?? tx.orderType}</span>
            )}
          </div>

          {/* Data / fonte temporal */}
          <div className="text-[10px] text-[#707A8A] mb-2">
            <span data-testid="extrato-executed-at">
              {tx.executedAt ? formatDateTime(tx.executedAt) : formatDateTime(tx.createdAt)}
            </span>
            {tx.timestampSource && (
              <span className="ml-2">({tx.timestampSource === 'ORDER_EXECUTED_AT' ? 'execucao' : 'criacao'})</span>
            )}
          </div>

          {/* Detalhamento financeiro */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#929AA5]">
            {isTrade && (
              <>
                <div data-testid="extrato-quantity">
                  Qtd: {tx.quantity ?? '—'}
                </div>
                <div data-testid="extrato-unit-price">
                  Preco/uni: {formatOrFallback(tx.price)}
                </div>
                <div data-testid="extrato-gross-amount">
                  Subtotal: {formatOrFallback(tx.grossAmount)}
                </div>
                <div data-testid="extrato-fee-amount">
                  Taxa: {formatOrFallback(tx.fee)}
                </div>
              </>
            )}
            {isFee && (
              <div className="col-span-2 text-[10px] text-[#707A8A]">
                Taxa ja incluida no total da negociacao relacionada.
              </div>
            )}
            {!isTrade && !isFee && tx.quantity != null && (
              <div data-testid="extrato-quantity">Qtd: {tx.quantity}</div>
            )}
          </div>
        </div>

        {/* Total debitado/creditado */}
        <div className="text-right flex-shrink-0 min-w-[80px]">
          <p
            data-testid="extrato-cash-delta"
            className={cn('text-sm font-bold font-mono', colorClass)}
          >
            {cashDelta !== null
              ? `${cashDelta < 0 ? '-' : '+'}${formatFS(Math.abs(cashDelta))}`
              : `${formatFS(totalDebitCredit ?? 0)}`}
          </p>
          <p className="text-[10px] text-[#707A8A] mt-0.5">
            {cashDelta !== null
              ? cashDelta < 0 ? 'Debitado' : 'Creditado'
              : 'Total'}
          </p>
        </div>
      </div>
    </div>
  )
}
