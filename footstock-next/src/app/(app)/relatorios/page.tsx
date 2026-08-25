'use client'

import { useCallback, useEffect, useState } from 'react'
import { mutate } from 'swr'
import {
  Download,
  Lock,
  AlertCircle,
  RefreshCw,
  SearchX,
  FileText,
  Loader2,
} from 'lucide-react'
import { formatFS, formatDateTime } from '@/lib/utils/format'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import {
  pnlProvenanceLabel,
  type TransactionDto,
} from '@/lib/contracts/transaction-contract'
import {
  EXPORT_DATA_MIN_PLAN,
  canExportData,
  formatExportDeniedMessage,
} from '@/lib/contracts/export-data-gate'
import { EmptyState } from '@/components/ui/empty-state'
import {
  TransactionFilters,
  EMPTY_TRANSACTION_FILTERS,
  buildTransactionQueryParams,
  validateTransactionFilterRange,
  type AssetOptionsStatus,
  type TransactionFilterAssetOption,
  type TransactionFilterValue,
} from '@/components/portfolio/TransactionFilters'

const MAX_ROWS = 200

const SIDE_LABELS: Record<string, string> = { BUY: 'Compra', SELL: 'Venda' }

const BTN_BASE =
  'inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3 py-2 text-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary'

type LoadState = 'loading' | 'error' | 'empty' | 'success'

function hasActiveReportFilters(value: TransactionFilterValue): boolean {
  return Boolean(value.type || value.assetId || value.from || value.to)
}

function fmt(value: number | null | undefined): string {
  return value != null ? formatFS(value) : '—'
}

function formatSignedPnl(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${formatFS(value)}`
}

function ReportPnl({ tx }: { tx: TransactionDto }) {
  if (tx.pnlProvenance === 'PERSISTED' && tx.realizedPnl != null) {
    const positive = tx.realizedPnl >= 0
    return (
      <span className="flex flex-col items-end gap-0.5">
        <span
          className={`font-mono text-md ${positive ? 'text-success' : 'text-error'}`}
        >
          {positive ? 'Lucro ' : 'Prejuízo '}
          {formatSignedPnl(tx.realizedPnl)}
        </span>
        <span className="text-base text-primary">
          {pnlProvenanceLabel(tx.pnlProvenance)} · bruto de taxas
        </span>
      </span>
    )
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="text-md text-primary">Indisponível</span>
      <span className="text-base text-primary">
        {pnlProvenanceLabel(tx.pnlProvenance ?? 'UNAVAILABLE')}
      </span>
    </span>
  )
}

export default function RelatoriosPage() {
  const { isReady, isError, plan } = usePlanGuard()
  const canExport = isReady && canExportData(plan)

  const [filters, setFilters] = useState<TransactionFilterValue>({
    ...EMPTY_TRANSACTION_FILTERS,
    financialType: 'TRADE',
  })
  const [assetOptions, setAssetOptions] = useState<TransactionFilterAssetOption[]>([])
  const [assetOptionsStatus, setAssetOptionsStatus] =
    useState<AssetOptionsStatus>('loading')
  const [assetRetryKey, setAssetRetryKey] = useState(0)
  const [data, setData] = useState<TransactionDto[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [emptyWasFiltered, setEmptyWasFiltered] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [deniedMessage, setDeniedMessage] = useState(
    formatExportDeniedMessage({ minPlan: EXPORT_DATA_MIN_PLAN }),
  )

  const rangeError = validateTransactionFilterRange(filters)

  useEffect(() => {
    let cancelled = false
    async function loadAssets() {
      setAssetOptionsStatus('loading')
      try {
        const res = await fetch('/api/v1/assets')
        if (!res.ok) {
          if (!cancelled) {
            setAssetOptions([])
            setAssetOptionsStatus('error')
          }
          return
        }
        const json = await res.json()
        const list: unknown = json?.data
        if (!Array.isArray(list) || cancelled) return
        const options = list
          .map((a) => a as Partial<TransactionFilterAssetOption>)
          .filter(
            (a): a is TransactionFilterAssetOption =>
              Boolean(a?.id && a?.ticker),
          )
          .map((a) => ({
            id: a.id,
            ticker: a.ticker,
            displayName: a.displayName ?? a.ticker,
          }))
        setAssetOptions(options)
        setAssetOptionsStatus(options.length === 0 ? 'empty' : 'success')
      } catch {
        if (!cancelled) {
          setAssetOptions([])
          setAssetOptionsStatus('error')
        }
      }
    }
    loadAssets()
    return () => {
      cancelled = true
    }
  }, [assetRetryKey])

  const load = useCallback(
    async (activeFilters: TransactionFilterValue) => {
      setState('loading')
      setError(null)
      const params = buildTransactionQueryParams(activeFilters)
      params.set('limit', String(MAX_ROWS))
      try {
        const res = await fetch(`/api/v1/transactions?${params.toString()}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(
            body?.error?.message ?? `Erro ${res.status} ao carregar relatório.`,
          )
        }
        const json: {
          data: TransactionDto[]
          pagination: { total: number }
        } = await res.json()
        setData(json.data ?? [])
        setTotal(json.pagination?.total ?? 0)
        setEmptyWasFiltered(hasActiveReportFilters(activeFilters))
        const tradeRows = (json.data ?? []).filter(
          (tx: TransactionDto) => tx.financialType === 'TRADE',
        )
        setState(tradeRows.length === 0 ? 'empty' : 'success')
      } catch (err) {
        setState('error')
        setError(
          err instanceof Error ? err.message : 'Erro ao carregar relatório.',
        )
      }
    },
    [],
  )

  useEffect(() => {
    if (rangeError) return
    load(filters)
  }, [filters, load, rangeError])

  function handleFiltersChange(next: TransactionFilterValue) {
    setFilters({ ...next, financialType: 'TRADE' })
  }

  function handleClearFilters() {
    setFilters({ ...EMPTY_TRANSACTION_FILTERS, financialType: 'TRADE' })
  }

  function handleRetry() {
    load(filters)
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const params = buildTransactionQueryParams(filters)
      const res = await fetch(
        `/api/v1/transactions/export?${params.toString()}`,
      )
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        const msg = formatExportDeniedMessage({
          message: body?.error?.message,
          minPlan: body?.error?.minPlan,
        })
        setDeniedMessage(msg)
        setExportError(msg)
        mutate('plan-guard')
        return
      }
      if (!res.ok) {
        throw new Error('Erro ao exportar relatório.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Erro ao exportar relatório.',
      )
    } finally {
      setExporting(false)
    }
  }

  const tradeData = data.filter((tx) => tx.financialType === 'TRADE')
  const visibleData = tradeData.slice(0, MAX_ROWS)

  function renderExportButton() {
    if (isError) {
      return (
        <button
          type="button"
          data-testid="player-report-export-error"
          onClick={() => mutate('plan-guard')}
          className={`${BTN_BASE} border-error text-primary hover:bg-elevated`}
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          Erro ao verificar plano
        </button>
      )
    }
    if (!isReady) {
      return (
        <span
          data-testid="player-report-export-loading"
          role="status"
          className={`${BTN_BASE} cursor-default border-border text-primary`}
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Verificando plano...
        </span>
      )
    }
    if (!canExport) {
      return (
        <span
          data-testid="player-report-export-locked"
          className={`${BTN_BASE} cursor-default border-border text-primary`}
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
          {deniedMessage}
        </span>
      )
    }
    return (
      <button
        type="button"
        data-testid="player-report-export"
        onClick={handleExport}
        disabled={exporting}
        className={`${BTN_BASE} border-transparent bg-accent text-primary hover:bg-accent-hover disabled:opacity-50`}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {exporting ? 'Exportando...' : 'Exportar CSV'}
      </button>
    )
  }

  function renderRowFields(tx: TransactionDto) {
    return [
      {
        label: 'Data',
        value: tx.executedAt ? formatDateTime(tx.executedAt) : '—',
        mono: true,
      },
      { label: 'Ticker', value: tx.ticker ?? '—', mono: false },
      {
        label: 'Lado',
        value: SIDE_LABELS[tx.side ?? ''] ?? tx.side ?? '—',
        mono: false,
      },
      {
        label: 'Qtd',
        value: tx.quantity != null ? String(tx.quantity) : '—',
        mono: true,
      },
      { label: 'Preço', value: fmt(tx.price), mono: true },
      { label: 'Bruto', value: fmt(tx.grossAmount), mono: true },
      { label: 'Taxa', value: fmt(tx.fee), mono: true },
      { label: 'Líquido', value: fmt(tx.totalAmount), mono: true },
    ]
  }

  function renderContent() {
    if (rangeError) {
      return (
        <div className="rounded-lg border border-border bg-card p-4 text-center text-md text-primary">
          Ajuste o período para ver o relatório.
        </div>
      )
    }

    if (state === 'loading') {
      return (
        <div
          data-testid="player-report-loading"
          aria-busy="true"
          aria-label="Carregando relatório"
          className="flex flex-col gap-2"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg border border-border bg-card animate-pulse md:h-10"
            />
          ))}
        </div>
      )
    }

    if (state === 'error') {
      return (
        <div
          data-testid="player-report-error"
          role="alert"
          className="rounded-xl border border-error bg-card p-4 text-center"
        >
          <AlertCircle
            className="mx-auto h-5 w-5 text-error"
            aria-hidden="true"
          />
          <p className="mt-2 text-md font-medium text-primary">
            {error ?? 'Erro ao carregar relatório.'}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            data-testid="player-report-retry"
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-error px-3 py-2 text-md font-medium text-primary hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      )
    }

    if (state === 'empty') {
      return (
        <div data-testid="player-report-empty">
          {emptyWasFiltered ? (
            <EmptyState
              icon={<SearchX />}
              title="Nenhuma negociação no filtro atual"
              description="Sua conta tem movimentação, mas nada dentro do filtro escolhido. Ajuste o período ou limpe os filtros."
              action={{ label: 'Limpar filtros', onClick: handleClearFilters }}
            />
          ) : (
            <EmptyState
              icon={<FileText />}
              title="Nenhuma negociação registrada"
              description="Suas negociações aparecerão aqui após a primeira operação"
            />
          )}
        </div>
      )
    }

    return (
      <>
        {total > MAX_ROWS && (
          <div
            data-testid="player-report-truncation"
            role="status"
            className="mb-3 rounded-lg border border-border bg-card px-3 py-2 text-md text-primary"
          >
            Exibindo os {MAX_ROWS} registros mais recentes. Exporte o CSV para
            ver até 10.000 linhas em até 366 dias.
          </div>
        )}

        <ul className="flex flex-col gap-2 md:hidden" data-testid="player-report-cards">
          {visibleData.map((tx) => (
            <li
              key={tx.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                {renderRowFields(tx).map((field) => (
                  <div key={field.label} className="min-w-0">
                    <dt className="text-base text-primary">{field.label}</dt>
                    <dd
                      className={`break-words text-md text-primary ${field.mono ? 'font-mono' : 'font-medium'}`}
                    >
                      {field.value}
                    </dd>
                  </div>
                ))}
                <div className="col-span-2 min-w-0">
                  <dt className="text-base text-primary">
                    Resultado realizado (bruto de taxas)
                  </dt>
                  <dd className="mt-1">
                    <ReportPnl tx={tx} />
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
          <table
            data-testid="player-report-table"
            className="w-full text-left text-md"
          >
            <thead className="bg-card">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-primary">
                  Data
                </th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-primary">
                  Ticker
                </th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-primary">
                  Lado
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-primary">
                  Qtd
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-primary">
                  Preço
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-primary">
                  Bruto
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-primary">
                  Taxa
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-primary">
                  Líquido
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-primary">
                  Resultado (bruto de taxas)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleData.map((tx) => (
                <tr key={tx.id} className="hover:bg-elevated">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-primary">
                    {tx.executedAt ? formatDateTime(tx.executedAt) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-bold text-primary">
                    {tx.ticker ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-primary">
                    {SIDE_LABELS[tx.side ?? ''] ?? tx.side ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-primary">
                    {tx.quantity != null ? tx.quantity : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-primary">
                    {fmt(tx.price)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-primary">
                    {fmt(tx.grossAmount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-primary">
                    {fmt(tx.fee)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-primary">
                    {fmt(tx.totalAmount)}
                  </td>
                  <td className="px-3 py-2 text-right text-primary">
                    <ReportPnl tx={tx} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  return (
    <div
      data-testid="player-report-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-0 px-4 pb-20 pt-4"
    >
      <h1 className="mb-4 text-lg font-bold text-primary">
        Relatório de Negociações
      </h1>

      <TransactionFilters
        value={filters}
        onChange={handleFiltersChange}
        assetOptions={assetOptions}
        error={rangeError}
        idPrefix="report-filter"
        showFinancialType={false}
        assetOptionsStatus={assetOptionsStatus}
        onRetryAssets={() => setAssetRetryKey((k) => k + 1)}
      />

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-md text-primary">
          {state === 'success'
            ? `${visibleData.length}${total > MAX_ROWS ? ` de ${total}` : ''} negociações`
            : ''}
        </span>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          {renderExportButton()}
          {exportError && (
            <p role="alert" className="text-md text-error">
              {exportError}
            </p>
          )}
        </div>
      </div>

      {renderContent()}
    </div>
  )
}
