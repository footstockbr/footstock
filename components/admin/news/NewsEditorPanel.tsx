'use client'

import type { FormState, Impact, Sentiment, EditorialStatus } from './types'
import { IMPACT_OPTIONS, SENTIMENT_OPTIONS } from './types'
import { NEWS_STATUS } from '@/lib/enums'

interface NewsEditorPanelProps {
  editingId: string | null
  form: FormState
  isSaving: boolean
  onSubmit: (e: React.FormEvent) => void
  onFieldChange: <K extends keyof FormState>(field: K, value: FormState[K]) => void
  onCancelEdit: () => void
}

export function NewsEditorPanel({
  editingId,
  form,
  isSaving,
  onSubmit,
  onFieldChange,
  onCancelEdit,
}: NewsEditorPanelProps) {
  const panelTitle = editingId ? 'Editar notícia editorial' : 'Criar notícia editorial'

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-semibold text-zinc-200">{panelTitle}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-zinc-400">
          Título
          <input
            value={form.title}
            onChange={e => onFieldChange('title', e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
            minLength={5}
            required
          />
        </label>
        <label className="text-xs text-zinc-400">
          Ticker
          <input
            value={form.ticker}
            onChange={e => onFieldChange('ticker', e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
            maxLength={5}
            placeholder="URU3"
            required
          />
        </label>
      </div>
      <label className="block text-xs text-zinc-400">
        Conteúdo
        <textarea
          value={form.content}
          onChange={e => onFieldChange('content', e.target.value)}
          className="mt-1 h-24 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
          minLength={10}
          required
        />
      </label>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-xs text-zinc-400">
          Impacto
          <select
            value={form.impact}
            onChange={e => onFieldChange('impact', e.target.value as Impact)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            {IMPACT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Sentimento
          <select
            value={form.sentiment}
            onChange={e => onFieldChange('sentiment', e.target.value as Sentiment)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            {SENTIMENT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Status
          <select
            value={form.status}
            onChange={e => onFieldChange('status', e.target.value as EditorialStatus)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value={NEWS_STATUS.DRAFT}>Rascunho</option>
            <option value={NEWS_STATUS.PUBLISHED}>Publicada</option>
            <option value={NEWS_STATUS.ARCHIVED}>Arquivada</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Fonte (opcional)
          <input
            value={form.source}
            onChange={e => onFieldChange('source', e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-[#F0B90B] px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
        >
          {isSaving ? 'Salvando...' : editingId ? 'Salvar edição' : 'Criar notícia'}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200"
          >
            Cancelar edição
          </button>
        )}
      </div>
    </form>
  )
}
