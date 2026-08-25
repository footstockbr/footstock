'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFS, formatDateTime } from '@/lib/utils/format'
import type { TransactionDto, PnlProvenance } from '@/lib/contracts/transaction-contract'
import { pnlProvenanceLabel } from '@/lib/contracts/transaction-contract'

/**
 * Forma aceita pelo item do extrato.
 *
 * Derivada de `TransactionDto` de proposito: o contrato da API e a unica fonte
 * da verdade do payload e nao existe mais uma copia manual da interface aqui.
 * `Partial` cobre payload legado, gravado antes de alguns campos existirem —
 * campo ausente vira rotulo de indisponivel, nunca zero fabricado.
 */
export type ExtratoItemTransaction = Partial<TransactionDto> &
  Pick<TransactionDto, 'id' | 'financialType' | 'createdAt'>

const UNAVAILABLE = 'Indisponível'

const FINANCIAL_TYPE_CONFIG: Record<string, { label: string; colorClass: string }> = {
  TRADE:            { label: 'Negociação',        colorClass: '' },
  FEE:              { label: 'Taxa Operacional',   colorClass: 'text-warning' },
  BONUS:            { label: 'Bônus',              colorClass: 'text-success' },
  DEPOSIT:          { label: 'Depósito',           colorClass: 'text-success' },
  WITHDRAWAL:       { label: 'Saque',              colorClass: 'text-error' },
  SHORT_INTEREST:   { label: 'Juros Short',        colorClass: 'text-error' },
  MARGIN_BLOCKED:   { label: 'Margem Bloqueada',   colorClass: 'text-primary' },
  SHORT_CLOSE:      { label: 'Fechamento Short',   colorClass: 'text-success' },
  LEVERAGE_INTEREST:{ label: 'Juros Alavancagem',  colorClass: 'text-error' },
}

const SIDE_COLORS: Record<string, string> = {
  BUY:  'text-success',
  SELL: 'text-error',
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

// O enum tecnico nunca chega ao usuario.
const TIMESTAMP_SOURCE_LABELS: Record<string, string> = {
  ORDER_EXECUTED_AT: 'Execução da ordem',
  TRANSACTION_CREATED_AT: 'Criação da transação',
}

export type ExtratoItemMode = 'summary' | 'expandable'

interface ExtratoItemProps {
  transaction: ExtratoItemTransaction
  /** `summary` mostra so a linha; `expandable` adiciona o drill-down. */
  mode?: ExtratoItemMode
  /** Abre o drill-down ja expandido no primeiro render. */
  defaultExpanded?: boolean
}

function safeNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return value
}

function formatOrFallback(value: number | null | undefined): string {
  const n = safeNumber(value)
  return n === null ? UNAVAILABLE : formatFS(n)
}

function formatSigned(value: number | null | undefined): string {
  const n = safeNumber(value)
  if (n === null) return UNAVAILABLE
  return `${n < 0 ? '-' : '+'}${formatFS(Math.abs(n))}`
}

function textOrFallback(value: string | null | undefined): string {
  return value ? value : UNAVAILABLE
}

interface DetailRowProps {
  label: string
  value: string
  testId?: string
  mono?: boolean
}

function DetailRow({ label, value, testId, mono }: DetailRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-base uppercase tracking-wide text-primary">{label}</dt>
      <dd
        data-testid={testId}
        className={cn('text-base text-primary text-right break-all', mono && 'font-mono')}
      >
        {value}
      </dd>
    </div>
  )
}

export function ExtratoItem({
  transaction: tx,
  mode = 'summary',
  defaultExpanded = false,
}: ExtratoItemProps) {
  // Todo o drill-down sai do payload que ja veio na listagem: expandir nunca
  // dispara request adicional.
  const [expanded, setExpanded] = useState(defaultExpanded)

  const config = FINANCIAL_TYPE_CONFIG[tx.financialType] ?? { label: tx.financialType, colorClass: '' }
  const isFee   = tx.financialType === 'FEE'
  const isTrade = tx.financialType === 'TRADE'
  const isBonus = tx.financialType === 'BONUS'
  const sideKey = tx.side ?? ''

  const label = isTrade && sideKey
    ? SIDE_LABELS[sideKey] ?? sideKey
    : config.label

  const colorClass = isTrade && sideKey
    ? SIDE_COLORS[sideKey] ?? 'text-primary'
    : config.colorClass || 'text-primary'

  const title = tx.ticker
    ? `${tx.ticker}${tx.displayName ? ` — ${tx.displayName}` : ''}`
    : tx.displayName ?? label

  const cashDelta = safeNumber(tx.cashDelta)
  const totalDebitCredit = cashDelta !== null ? Math.abs(cashDelta) : safeNumber(tx.totalAmount)
  const isExpandable = mode === 'expandable'
  const detailsId = `extrato-details-${tx.id}`

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4',
        isFee ? 'border-warning' : 'border-border',
      )}
      data-testid={isFee ? 'extrato-fee-item' : isBonus ? 'extrato-bonus-item' : 'extrato-trade-item'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Linha principal: ticker/nome + lado/tipo */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span data-testid="extrato-asset-ticker" className={cn('text-md font-bold', colorClass)}>
              {title}
            </span>
            <span className="text-base font-medium text-primary">
              {label}
            </span>
            {isTrade && tx.orderType && (
              <span className="text-base text-primary">{TYPE_LABELS[tx.orderType] ?? tx.orderType}</span>
            )}
          </div>

          {/* Data / fonte temporal */}
          <div className="mb-2 font-mono text-base text-primary">
            <span data-testid="extrato-executed-at">
              {tx.executedAt ? formatDateTime(tx.executedAt) : formatDateTime(tx.createdAt)}
            </span>
            {tx.timestampSource && (
              <span className="ml-2">({tx.timestampSource === 'ORDER_EXECUTED_AT' ? 'execucao' : 'criacao'})</span>
            )}
          </div>

          {/* Detalhamento financeiro */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-md text-primary">
            {isTrade && (
              <>
                <div data-testid="extrato-quantity">
                  Qtd: {tx.quantity ?? UNAVAILABLE}
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
              <div className="col-span-2 text-base text-primary">
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
            className={cn('text-md font-bold font-mono', colorClass)}
          >
            {cashDelta !== null
              ? `${cashDelta < 0 ? '-' : '+'}${formatFS(Math.abs(cashDelta))}`
              : totalDebitCredit !== null
                ? formatFS(totalDebitCredit)
                : UNAVAILABLE}
          </p>
          <p className="mt-0.5 text-base text-primary">
            {cashDelta !== null
              ? cashDelta < 0 ? 'Debitado' : 'Creditado'
              : 'Total'}
          </p>
        </div>
      </div>

      {isExpandable && (
        <>
          <button
            type="button"
            data-testid={`extrato-expand-${tx.id}`}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={expanded ? 'Recolher detalhes da transação' : 'Ver detalhes da transação'}
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 py-2 text-md text-primary hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
              aria-hidden="true"
            />
            {expanded ? 'Menos detalhes' : 'Mais detalhes'}
          </button>

          {expanded && (
            <dl
              id={detailsId}
              data-testid={detailsId}
              role="region"
              aria-label="Detalhes da transação"
              className="mt-2 grid grid-cols-1 gap-1.5 rounded-md border border-border bg-elevated p-3 sm:grid-cols-2 sm:gap-x-6"
            >
              <DetailRow label="ID da transação" value={tx.id} testId="extrato-transaction-id" mono />
              <DetailRow label="Ordem" value={textOrFallback(tx.orderId)} testId="extrato-order-id" mono />
              <DetailRow label="Ativo" value={textOrFallback(tx.assetId)} testId="extrato-asset-id" mono />
              <DetailRow
                label="Lançamento"
                value={config.label}
                testId="extrato-financial-type"
              />
              <DetailRow
                label="Tipo de ordem"
                value={tx.orderType ? TYPE_LABELS[tx.orderType] ?? tx.orderType : UNAVAILABLE}
                testId="extrato-order-type"
              />
              <DetailRow
                label="Origem da data"
                value={
                  tx.timestampSource
                    ? TIMESTAMP_SOURCE_LABELS[tx.timestampSource] ?? UNAVAILABLE
                    : UNAVAILABLE
                }
                testId="extrato-timestamp-source"
              />
              <DetailRow
                label="Saldo antes"
                value={formatOrFallback(tx.balanceBefore)}
                testId="extrato-balance-before"
                mono
              />
              <DetailRow
                label="Saldo depois"
                value={formatOrFallback(tx.balanceAfter)}
                testId="extrato-balance-after"
                mono
              />
              <DetailRow
                label="Valor lançado"
                value={formatSigned(tx.fsAmount)}
                testId="extrato-fs-amount"
                mono
              />
              <DetailRow
                label="Caixa movimentado"
                value={formatSigned(tx.cashDelta)}
                testId="extrato-cash-delta-detail"
                mono
              />
              {isTrade && (
                <>
                  <DetailRow
                    label="Resultado realizado (bruto de taxas)"
                    value={
                      tx.pnlProvenance === 'PERSISTED' && tx.realizedPnl != null
                        ? formatSigned(tx.realizedPnl)
                        : pnlProvenanceLabel((tx.pnlProvenance as PnlProvenance) ?? 'UNAVAILABLE')
                    }
                    testId="extrato-realized-pnl"
                    mono={tx.pnlProvenance === 'PERSISTED'}
                  />
                  <p className="col-span-full mt-1 text-base text-primary">
                    O caixa movimentado ja considera a taxa desta operação. A taxa nunca é somada duas vezes.
                    O resultado realizado e bruto de taxas; taxas sao contabilizadas em separado.
                  </p>
                </>
              )}
            </dl>
          )}
        </>
      )}
    </div>
  )
}
