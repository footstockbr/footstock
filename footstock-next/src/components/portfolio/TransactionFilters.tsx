'use client'

// ============================================================================
// TransactionFilters — barra de filtros compartilhada do extrato
//
// Componente CONTROLADO: recebe valor e handler por prop, nao guarda estado de
// filtro nem conhece paginacao, listagem ou fetch. Isso o mantem reusavel pela
// pagina de relatorios sem qualquer import do componente de historico.
//
// Contrato de datas (UX-008): na TELA o intervalo e inclusivo dos dois lados —
// escolher o mesmo dia em `de` e `ate` devolve as transacoes daquele dia. A API
// trata `to` como EXCLUSIVO (Task 09), entao a conversao para o dia seguinte
// acontece aqui, em `buildTransactionQueryParams`, e nunca na cabeca do usuario.
// ============================================================================

import { AlertCircle, Filter, RefreshCw, X } from 'lucide-react'
import {
  VALID_FINANCIAL_TYPES,
  VALID_TRANSACTION_TYPES,
} from '@/lib/contracts/transaction-contract'

export interface TransactionFilterAssetOption {
  id: string
  ticker: string
  displayName: string
}

export interface TransactionFilterValue {
  type: string
  financialType: string
  assetId: string
  /** Data inicial INCLUSIVA no formato `YYYY-MM-DD`. */
  from: string
  /** Data final INCLUSIVA na tela no formato `YYYY-MM-DD`. */
  to: string
}

export const EMPTY_TRANSACTION_FILTERS: TransactionFilterValue = {
  type: '',
  financialType: '',
  assetId: '',
  from: '',
  to: '',
}

export type AssetOptionsStatus = 'loading' | 'error' | 'empty' | 'success'

const OPERATION_LABELS: Record<string, string> = {
  MARKET: 'Mercado',
  LIMIT: 'Limitada',
  STOP_LOSS: 'Stop Loss',
  TAKE_PROFIT: 'Take Profit',
  OCO: 'OCO',
  SCHEDULED: 'Agendada',
}

const FINANCIAL_LABELS: Record<string, string> = {
  TRADE: 'Negociação',
  BONUS: 'Bônus',
  DEPOSIT: 'Depósito',
  WITHDRAWAL: 'Saque',
  SHORT_INTEREST: 'Juros Short',
  MARGIN_BLOCKED: 'Margem Bloqueada',
  SHORT_CLOSE: 'Fechamento Short',
  LEVERAGE_INTEREST: 'Juros Alavancagem',
  FEE: 'Taxa Operacional',
}

const OPERATION_OPTIONS = VALID_TRANSACTION_TYPES.map((value) => ({
  value,
  label: OPERATION_LABELS[value] ?? value,
}))

const FINANCIAL_OPTIONS = VALID_FINANCIAL_TYPES.map((value) => ({
  value,
  label: FINANCIAL_LABELS[value] ?? value,
}))

export const INVERTED_RANGE_MESSAGE = 'A data inicial deve ser anterior ou igual à data final.'

export function hasActiveTransactionFilters(
  value: TransactionFilterValue,
  options?: { ignoreFinancialType?: boolean },
): boolean {
  return Boolean(
    value.type ||
      (options?.ignoreFinancialType ? false : value.financialType) ||
      value.assetId ||
      value.from ||
      value.to,
  )
}

export function validateTransactionFilterRange(value: TransactionFilterValue): string | null {
  if (!value.from || !value.to) return null
  return value.from > value.to ? INVERTED_RANGE_MESSAGE : null
}

export function toExclusiveEndDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

export function buildTransactionQueryParams(value: TransactionFilterValue): URLSearchParams {
  const params = new URLSearchParams()
  if (value.type) params.set('type', value.type)
  if (value.financialType) params.set('financialType', value.financialType)
  if (value.assetId) params.set('assetId', value.assetId)
  if (value.from) params.set('from', value.from)
  if (value.to) params.set('to', toExclusiveEndDate(value.to))
  return params
}

interface TransactionFiltersProps {
  value: TransactionFilterValue
  onChange: (next: TransactionFilterValue) => void
  assetOptions?: TransactionFilterAssetOption[]
  error?: string | null
  disabled?: boolean
  idPrefix?: string
  /** Quando false, o controle de lancamento nao e renderizado (relatorio TRADE-only). */
  showFinancialType?: boolean
  assetOptionsStatus?: AssetOptionsStatus
  onRetryAssets?: () => void
}

const FIELD_CLASS =
  'w-full min-h-[44px] rounded-md border border-border bg-card px-3 py-2 text-md text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

const LABEL_CLASS = 'mb-1 block text-md font-medium text-primary'

export function TransactionFilters({
  value,
  onChange,
  assetOptions = [],
  error = null,
  disabled = false,
  idPrefix = 'transaction-filter',
  showFinancialType = true,
  assetOptionsStatus = 'success',
  onRetryAssets,
}: TransactionFiltersProps) {
  const isActive = hasActiveTransactionFilters(value, {
    ignoreFinancialType: !showFinancialType,
  })
  const assetDisabled =
    disabled ||
    assetOptionsStatus === 'loading' ||
    assetOptionsStatus === 'error' ||
    assetOptions.length === 0

  function patch(partial: Partial<TransactionFilterValue>) {
    onChange({ ...value, ...partial })
  }

  function handleClear() {
    onChange({
      ...EMPTY_TRANSACTION_FILTERS,
      ...(showFinancialType ? {} : { financialType: value.financialType }),
    })
  }

  return (
    <section
      aria-label="Filtros do extrato"
      data-testid="transaction-filters"
      className="mb-3 rounded-lg border border-border bg-card p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-md font-semibold text-primary">
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filtros
        </span>
        <button
          type="button"
          data-testid="transaction-filter-clear"
          onClick={handleClear}
          disabled={disabled || !isActive}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 py-2 text-md text-primary hover:bg-elevated disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Limpar filtros
        </button>
      </div>

      {error && (
        <p
          role="alert"
          data-testid="transaction-filter-error"
          className="mb-2 flex items-start gap-2 rounded-md border border-error bg-card px-3 py-2 text-md text-primary"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <div
        className={
          showFinancialType
            ? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5'
            : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4'
        }
      >
        <div>
          <label className={LABEL_CLASS} htmlFor={`${idPrefix}-type`}>
            Tipo de operação
          </label>
          <select
            id={`${idPrefix}-type`}
            data-testid="transaction-filter-type"
            className={FIELD_CLASS}
            value={value.type}
            disabled={disabled}
            onChange={(e) => patch({ type: e.target.value })}
          >
            <option value="">Todas</option>
            {OPERATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {showFinancialType && (
          <div>
            <label className={LABEL_CLASS} htmlFor={`${idPrefix}-financial-type`}>
              Tipo de lançamento
            </label>
            <select
              id={`${idPrefix}-financial-type`}
              data-testid="transaction-filter-financial-type"
              className={FIELD_CLASS}
              value={value.financialType}
              disabled={disabled}
              onChange={(e) => patch({ financialType: e.target.value })}
            >
              <option value="">Todos</option>
              {FINANCIAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={LABEL_CLASS} htmlFor={`${idPrefix}-asset`}>
            Ativo
          </label>
          <select
            id={`${idPrefix}-asset`}
            data-testid="transaction-filter-asset"
            className={FIELD_CLASS}
            value={value.assetId}
            disabled={assetDisabled}
            onChange={(e) => patch({ assetId: e.target.value })}
          >
            <option value="">
              {assetOptionsStatus === 'loading'
                ? 'Carregando ativos...'
                : assetOptionsStatus === 'error'
                  ? 'Ativos indisponíveis'
                  : 'Todos os ativos'}
            </option>
            {assetOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ticker} - {a.displayName}
              </option>
            ))}
          </select>
          {assetOptionsStatus === 'error' && (
            <div
              data-testid="transaction-filter-asset-error"
              className="mt-1 flex items-start justify-between gap-2 text-base text-primary"
            >
              <span>Não foi possível carregar a lista de ativos.</span>
              {onRetryAssets && (
                <button
                  type="button"
                  data-testid="transaction-filter-asset-retry"
                  onClick={onRetryAssets}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 text-md text-primary hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Tentar de novo
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor={`${idPrefix}-from`}>
            De
          </label>
          <input
            id={`${idPrefix}-from`}
            data-testid="transaction-filter-from"
            type="date"
            className={FIELD_CLASS}
            value={value.from}
            disabled={disabled}
            onChange={(e) => patch({ from: e.target.value })}
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor={`${idPrefix}-to`}>
            Até
          </label>
          <input
            id={`${idPrefix}-to`}
            data-testid="transaction-filter-to"
            type="date"
            className={FIELD_CLASS}
            value={value.to}
            disabled={disabled}
            onChange={(e) => patch({ to: e.target.value })}
          />
          <p className="mt-1 text-base text-primary">Inclui o dia escolhido.</p>
        </div>
      </div>
    </section>
  )
}
