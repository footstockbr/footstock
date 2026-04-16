'use client'

import { cn } from '@/lib/utils'
import { formatFS, formatDateTime } from '@/lib/utils/format'

export interface ExtratoTransaction {
  id: string
  orderId?: string | null
  assetId?: string | null   // null para lançamentos sem ativo (BONUS, DIVIDEND)
  type?: string | null
  financialType: string
  side?: string | null      // null para lançamentos sem side (BONUS, DIVIDEND)
  quantity?: number | null
  price?: number | null
  fee?: number | null
  totalAmount: number
  fsAmount?: number | null
  createdAt: string
}

const FINANCIAL_TYPE_CONFIG: Record<string, { label: string; colorClass: string; amountPrefix: string }> = {
  TRADE:            { label: 'Negociação',        colorClass: '',             amountPrefix: '' },
  FEE:              { label: 'Taxa Operacional',   colorClass: 'text-[#F0B90B]', amountPrefix: '-' },
  BONUS:            { label: 'Bônus',              colorClass: 'text-[#2EBD85]', amountPrefix: '+' },
  DEPOSIT:          { label: 'Depósito',           colorClass: 'text-[#2EBD85]', amountPrefix: '+' },
  WITHDRAWAL:       { label: 'Saque',              colorClass: 'text-[#F6465D]', amountPrefix: '-' },
  SHORT_INTEREST:   { label: 'Juros Short',        colorClass: 'text-[#F6465D]', amountPrefix: '-' },
  MARGIN_BLOCKED:   { label: 'Margem Bloqueada',   colorClass: 'text-[#929AA5]', amountPrefix: '-' },
  SHORT_CLOSE:      { label: 'Fechamento Short',   colorClass: 'text-[#2EBD85]', amountPrefix: '+' },
  LEVERAGE_INTEREST:{ label: 'Juros Alavancagem',  colorClass: 'text-[#F6465D]', amountPrefix: '-' },
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

export function ExtratoItem({ transaction: tx }: ExtratoItemProps) {
  const config = FINANCIAL_TYPE_CONFIG[tx.financialType] ?? { label: tx.financialType, colorClass: '', amountPrefix: '' }
  const isFee   = tx.financialType === 'FEE'
  const isTrade = tx.financialType === 'TRADE'
  const isBonus = tx.financialType === 'BONUS'
  const sideKey = tx.side ?? ''

  return (
    <div
      className={cn(
        'bg-[#1E2329] rounded-lg border p-4 flex items-center justify-between',
        isFee
          ? 'border-[rgba(240,185,11,.3)] bg-[rgba(240,185,11,.04)]'
          : 'border-[rgba(240,185,11,.18)]'
      )}
      data-testid={isFee ? 'extrato-fee-item' : isBonus ? 'extrato-bonus-item' : 'extrato-trade-item'}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {isTrade && tx.side && (
            <span className={cn('text-xs font-bold', SIDE_COLORS[sideKey] ?? 'text-[#EAECEF]')}>
              {SIDE_LABELS[sideKey] ?? sideKey}
            </span>
          )}
          <span className={cn('text-xs font-medium', isFee ? 'text-[#F0B90B]' : isBonus ? 'text-[#2EBD85]' : 'text-[#929AA5]')}>
            {config.label}
          </span>
          {isTrade && tx.type && (
            <span className="text-xs text-[#707A8A]">{TYPE_LABELS[tx.type] ?? tx.type}</span>
          )}
        </div>

        {isFee && tx.orderId && (
          <div className="text-[10px] text-[#707A8A] mb-1 font-mono truncate">
            Ordem: {tx.orderId}
          </div>
        )}

        {isTrade && tx.quantity != null && tx.price != null && (
          <div className="text-xs text-[#929AA5]">
            {tx.quantity} cotas x {formatFS(tx.price)}
            {tx.fee != null && tx.fee > 0 && (
              <span className="ml-2 text-[#707A8A]">taxa: {formatFS(tx.fee)}</span>
            )}
          </div>
        )}

        <div className="text-[10px] text-[#707A8A] mt-1">{formatDateTime(tx.createdAt)}</div>
      </div>

      <div className="text-right ml-3 flex-shrink-0">
        {isFee ? (
          <p className="text-sm font-bold font-mono text-[#F0B90B]">
            -{formatFS(tx.totalAmount)}
          </p>
        ) : isBonus ? (
          // Bônus: sempre positivo, verde (T-021)
          <p className="text-sm font-bold font-mono text-[#2EBD85]">
            +{formatFS(Math.abs(tx.totalAmount))}
          </p>
        ) : (
          <p className={cn('text-sm font-bold font-mono', SIDE_COLORS[sideKey] ?? 'text-[#EAECEF]')}>
            {tx.side === 'BUY' ? '-' : '+'}{formatFS(Math.abs(tx.totalAmount))}
          </p>
        )}
      </div>
    </div>
  )
}
