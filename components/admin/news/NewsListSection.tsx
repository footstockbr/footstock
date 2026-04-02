'use client'

import { useState } from 'react'
import { STATUS_BADGE, STATUS_LABEL } from './types'
import type { EditorialNews, EditorialStatus } from './types'
import { NEWS_STATUS } from '@/lib/enums'
import { maskDateInput, displayToIso, isoToDisplay } from '@/lib/utils/formatDate'

interface NewsListSectionProps {
  items: EditorialNews[]
  isLoading: boolean
  statusFilter: 'ALL' | EditorialStatus
  tickerFilter: string
  fromFilter: string
  toFilter: string
  onStatusFilterChange: (value: 'ALL' | EditorialStatus) => void
  onTickerFilterChange: (value: string) => void
  onFromFilterChange: (value: string) => void
  onToFilterChange: (value: string) => void
  onApplyFilters: () => void
  onEdit: (item: EditorialNews) => void
  onUpdateStatus: (item: EditorialNews, status: EditorialStatus) => void
  onDelete: (item: EditorialNews) => void
}

export function NewsListSection({
  items,
  isLoading,
  statusFilter,
  tickerFilter,
  fromFilter,
  toFilter,
  onStatusFilterChange,
  onTickerFilterChange,
  onFromFilterChange,
  onToFilterChange,
  onApplyFilters,
  onEdit,
  onUpdateStatus,
  onDelete,
}: NewsListSectionProps) {
  const [fromDisplay, setFromDisplay] = useState(() => fromFilter ? isoToDisplay(fromFilter) : '')
  const [toDisplay, setToDisplay] = useState(() => toFilter ? isoToDisplay(toFilter) : '')

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskDateInput(e.target.value)
    setFromDisplay(masked)
    if (masked.length === 0) {
      onFromFilterChange('')
    } else {
      const iso = displayToIso(masked)
      if (iso) onFromFilterChange(iso)
    }
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskDateInput(e.target.value)
    setToDisplay(masked)
    if (masked.length === 0) {
      onToFilterChange('')
    } else {
      const iso = displayToIso(masked)
      if (iso) onToFilterChange(iso)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 grid gap-3 md:grid-cols-4">
        <label className="text-xs text-zinc-400">
          Status
          <select
            value={statusFilter}
            onChange={e => onStatusFilterChange(e.target.value as 'ALL' | EditorialStatus)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="ALL">Todos</option>
            <option value={NEWS_STATUS.PUBLISHED}>Publicadas</option>
            <option value={NEWS_STATUS.DRAFT}>Rascunhos</option>
            <option value={NEWS_STATUS.ARCHIVED}>Arquivadas</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Ticker
          <input
            value={tickerFilter}
            onChange={e => onTickerFilterChange(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            placeholder="URU3"
          />
        </label>
        <label className="text-xs text-zinc-400">
          De
          <input
            type="text"
            placeholder="dd/mm/aaaa"
            inputMode="numeric"
            maxLength={10}
            value={fromDisplay}
            onChange={handleFromChange}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="text-xs text-zinc-400">
          Até
          <input
            type="text"
            placeholder="dd/mm/aaaa"
            inputMode="numeric"
            maxLength={10}
            value={toDisplay}
            onChange={handleToChange}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
      </div>
      <div className="mb-3">
        <button
          type="button"
          onClick={onApplyFilters}
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Aplicar filtros
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-400">Carregando notícias...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma notícia encontrada com os filtros atuais.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-400">
                <th className="px-2 py-2">Título</th>
                <th className="px-2 py-2">Ticker</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Data</th>
                <th className="px-2 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-zinc-800/60 text-zinc-200">
                  <td className="px-2 py-2">
                    <p className="font-medium">{item.title}</p>
                    {item.source && <p className="text-xs text-zinc-500">{item.source}</p>}
                  </td>
                  <td className="px-2 py-2 font-mono">{item.ticker ?? '—'}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_BADGE[item.status]}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-400">
                    {new Date(item.updatedAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => onEdit(item)}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                      >
                        Editar
                      </button>
                      {item.status !== 'PUBLISHED' && (
                        <button
                          onClick={() => onUpdateStatus(item, 'PUBLISHED')}
                          className="rounded-md border border-emerald-700 px-2 py-1 text-xs text-emerald-300"
                        >
                          Publicar
                        </button>
                      )}
                      {item.status !== 'ARCHIVED' && (
                        <button
                          onClick={() => onUpdateStatus(item, 'ARCHIVED')}
                          className="rounded-md border border-amber-700 px-2 py-1 text-xs text-amber-300"
                        >
                          Arquivar
                        </button>
                      )}
                      {item.status !== 'DRAFT' && (
                        <button
                          onClick={() => onUpdateStatus(item, 'DRAFT')}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                        >
                          Rascunho
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(item)}
                        className="rounded-md border border-red-700 px-2 py-1 text-xs text-red-300"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
