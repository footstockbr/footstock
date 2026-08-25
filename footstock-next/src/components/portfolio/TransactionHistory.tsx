'use client'

import { useEffect, useState, useCallback } from 'react'
import { TrendingDown, AlertCircle, RefreshCw, SearchX } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ExtratoItem, type ExtratoItemTransaction } from '@/components/extrato/ExtratoItem'
import {
  TransactionFilters,
  EMPTY_TRANSACTION_FILTERS,
  buildTransactionQueryParams,
  hasActiveTransactionFilters,
  validateTransactionFilterRange,
  type AssetOptionsStatus,
  type TransactionFilterAssetOption,
  type TransactionFilterValue,
} from '@/components/portfolio/TransactionFilters'

interface PaginatedTransactions {
  data: ExtratoItemTransaction[]
  pagination: {
    page: number
    total: number
    totalPages: number
    hasNext: boolean
  }
}

type LoadState = 'loading' | 'error' | 'empty' | 'success'

export function TransactionHistory() {
  const [data, setData] = useState<ExtratoItemTransaction[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [filters, setFilters] = useState<TransactionFilterValue>(EMPTY_TRANSACTION_FILTERS)
  const [assetOptions, setAssetOptions] = useState<TransactionFilterAssetOption[]>([])
  const [assetOptionsStatus, setAssetOptionsStatus] = useState<AssetOptionsStatus>('loading')
  const [assetRetryKey, setAssetRetryKey] = useState(0)
  // Snapshot do que produziu o resultado atual: distingue "conta sem
  // movimentacao" de "filtro sem resultado" mesmo enquanto o usuario ja mexeu
  // nos controles.
  const [emptyWasFiltered, setEmptyWasFiltered] = useState(false)

  // Erro de intervalo e resolvido na propria tela: nao vale gastar request para
  // receber um 422 previsivel, e os valores digitados ficam preservados.
  const rangeError = validateTransactionFilterRange(filters)

  const load = useCallback(async (targetPage: number, activeFilters: TransactionFilterValue) => {
    setState('loading')
    setError(null)

    const params = buildTransactionQueryParams(activeFilters)
    params.set('page', String(targetPage))
    params.set('limit', '10')

    try {
      const res = await fetch(`/api/v1/transactions?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `Erro ${res.status} ao carregar extrato.`)
      }

      const json: PaginatedTransactions = await res.json()
      setData(json.data ?? [])
      setTotalPages(json.pagination?.totalPages ?? 1)
      setHasNext(json.pagination?.hasNext ?? false)
      setEmptyWasFiltered(hasActiveTransactionFilters(activeFilters))
      setState((json.data?.length ?? 0) === 0 ? 'empty' : 'success')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Erro ao carregar extrato.')
    }
  }, [])

  useEffect(() => {
    if (validateTransactionFilterRange(filters)) return
    load(page, filters)
  }, [page, filters, load])

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
          .filter((a): a is TransactionFilterAssetOption => Boolean(a?.id && a?.ticker))
          .map((a) => ({ id: a.id, ticker: a.ticker, displayName: a.displayName ?? a.ticker }))
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

  function handleFiltersChange(next: TransactionFilterValue) {
    setFilters(next)
    // Trocar filtro muda o conjunto: a pagina 4 do resultado antigo nao existe
    // no novo.
    setPage(1)
  }

  function handleRetry() {
    load(page, filters)
  }

  function handleClearFilters() {
    handleFiltersChange({ ...EMPTY_TRANSACTION_FILTERS })
  }

  const filtersBar = (
    <TransactionFilters
      value={filters}
      onChange={handleFiltersChange}
      assetOptions={assetOptions}
      error={rangeError}
      assetOptionsStatus={assetOptionsStatus}
      onRetryAssets={() => setAssetRetryKey((k) => k + 1)}
    />
  )

  function body() {
    if (rangeError) {
      // Intervalo invalido: nenhum request disparado e nenhuma lista fantasma.
      return (
        <div
          data-testid="transaction-history-range-blocked"
          className="rounded-lg border border-border bg-card p-4 text-center text-md text-primary"
        >
          Ajuste o período para ver o extrato.
        </div>
      )
    }

    if (state === 'loading') {
      return (
        <div data-testid="transaction-history-loading" aria-busy="true" aria-label="Carregando extrato" className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
              <div className="mb-2 h-4 w-40 rounded bg-elevated" />
              <div className="h-3 w-28 rounded bg-elevated" />
            </div>
          ))}
        </div>
      )
    }

    if (state === 'error') {
      return (
        <div
          data-testid="transaction-history-error"
          role="alert"
          className="rounded-xl border border-error bg-card p-4 text-center"
        >
          <AlertCircle className="mx-auto h-5 w-5 text-error" aria-hidden="true" />
          <p className="mt-2 text-md font-medium text-primary">
            {error ?? 'Erro ao carregar extrato.'}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            data-testid="transaction-history-retry"
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
        <div data-testid="transaction-history-empty">
          {emptyWasFiltered ? (
            <div data-testid="transaction-history-empty-filtered">
              <EmptyState
                icon={<SearchX />}
                title="Nenhuma transação no filtro atual"
                description="Sua conta tem movimentação, mas nada dentro do filtro escolhido. Ajuste o período ou limpe os filtros."
                action={{ label: 'Limpar filtros', onClick: handleClearFilters }}
              />
            </div>
          ) : (
            <div data-testid="transaction-history-empty-account">
              <EmptyState
                icon={<TrendingDown />}
                title="Extrato vazio"
                description="Suas transações aparecerão aqui após a primeira operação"
              />
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-2" data-testid="transaction-history-success">
        {data.map((tx) => (
          <ExtratoItem key={tx.id} transaction={tx} mode="expandable" />
        ))}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-2">
            <button
              type="button"
              aria-label="Página anterior"
              data-testid="transaction-history-prev"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-[44px] min-w-[44px] rounded-md bg-elevated px-3 py-1 text-md text-primary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Anterior
            </button>
            <span className="self-center text-md text-primary">{page}/{totalPages}</span>
            <button
              type="button"
              aria-label="Próxima página"
              data-testid="transaction-history-next"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={!hasNext}
              className="min-h-[44px] min-w-[44px] rounded-md bg-elevated px-3 py-1 text-md text-primary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Proxima
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {filtersBar}
      {body()}
    </div>
  )
}
