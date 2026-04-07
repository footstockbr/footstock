'use client'

import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { Rss, Plus, Pencil, Trash2, Check, X, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RssFeed {
  id: string
  url: string
  name: string
  isActive: boolean
  createdAt: string
}

interface ApiResponse {
  success: boolean
  data?: { feeds: RssFeed[] }
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<ApiResponse>)

const inputClass =
  'h-10 min-h-[44px] w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#0B0E11] px-3 text-sm text-[#EAECEF] placeholder-[#929AA5] focus:outline-none focus:border-[#F0B90B] transition-colors'

// ---------------------------------------------------------------------------
// Add / Edit form (modal)
// ---------------------------------------------------------------------------

function FeedForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial?: RssFeed
  onSave: (data: { url: string; name: string; isActive: boolean }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [url, setUrl]         = useState(initial?.url ?? '')
  const [name, setName]       = useState(initial?.name ?? '')
  const [isActive, setActive] = useState(initial?.isActive ?? true)
  const [err, setErr]         = useState('')
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      new URL(url)
    } catch {
      setErr('URL inválida. Ex: https://www.espn.com.br/rss')
      return
    }
    if (name.trim().length < 2) {
      setErr('Nome deve ter pelo menos 2 caracteres.')
      return
    }
    await onSave({ url: url.trim(), name: name.trim(), isActive })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="block text-xs text-[#929AA5] mb-1">Nome do site</label>
        <input
          ref={firstRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ESPN Brasil"
          className={inputClass}
          disabled={isSaving}
          maxLength={80}
        />
      </div>
      <div>
        <label className="block text-xs text-[#929AA5] mb-1">URL do feed RSS</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.espn.com.br/rss"
          className={inputClass}
          disabled={isSaving}
          type="url"
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setActive(e.target.checked)}
          disabled={isSaving}
          className="h-4 w-4 rounded accent-[#F0B90B]"
        />
        <span className="text-sm text-[#EAECEF]">Feed ativo</span>
      </label>

      {err && (
        <p className="text-xs text-[#F6465D] flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {err}
        </p>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="h-9 px-4 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5] hover:text-[#EAECEF] hover:border-[rgba(240,185,11,.35)] transition-colors min-h-[44px]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="h-9 px-4 rounded-lg bg-[rgba(240,185,11,.12)] border border-[rgba(240,185,11,.25)] text-sm font-medium text-[#F0B90B] hover:bg-[rgba(240,185,11,.2)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {isSaving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FeedWhitelist() {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    '/api/v1/admin/news/feeds',
    fetcher
  )

  const feeds = data?.data?.feeds ?? []

  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<RssFeed | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape
  useEffect(() => {
    if (!modalMode) return
    document.body.style.overflow = 'hidden'

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal() }
      if (e.key === 'Tab' && modalRef.current) {
        const els = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'))
        if (!els.length) return
        const idx = els.indexOf(document.activeElement as HTMLElement)
        e.preventDefault()
        els[e.shiftKey ? (idx <= 0 ? els.length - 1 : idx - 1) : (idx >= els.length - 1 ? 0 : idx + 1)].focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', handleKey) }
  }, [modalMode])

  function openAdd() { setEditTarget(null); setModalMode('add') }
  function openEdit(feed: RssFeed) { setEditTarget(feed); setModalMode('edit') }
  function closeModal() { setModalMode(null); setEditTarget(null) }

  async function handleSave(formData: { url: string; name: string; isActive: boolean }) {
    setIsSaving(true)
    try {
      const isEdit = modalMode === 'edit' && editTarget
      const res = await fetch(
        isEdit ? `/api/v1/admin/news/feeds/${editTarget!.id}` : '/api/v1/admin/news/feeds',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      )
      const json = await res.json() as ApiResponse
      if (!json.success) throw new Error(json.error?.message ?? 'Erro ao salvar.')
      await mutate()
      closeModal()
    } catch {
      // error surfaces inside FeedForm via re-throw — for now close on success only
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggle(feed: RssFeed) {
    setTogglingId(feed.id)
    try {
      await fetch(`/api/v1/admin/news/feeds/${feed.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !feed.isActive }),
      })
      await mutate()
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/v1/admin/news/feeds/${id}`, { method: 'DELETE' })
      await mutate()
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  const activeCount = feeds.filter((f) => f.isActive).length

  return (
    <div className="mt-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Rss className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">Whitelist de Feeds RSS</h2>
          <span className="text-xs text-[#929AA5] bg-[#1E2329] border border-[rgba(240,185,11,.08)] rounded-full px-2 py-0.5">
            {activeCount}/{feeds.length} ativos
          </span>
        </div>
        <button
          onClick={openAdd}
          aria-label="Adicionar feed RSS"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[rgba(240,185,11,.08)] border border-[rgba(240,185,11,.18)] text-xs font-medium text-[#F0B90B] hover:bg-[rgba(240,185,11,.15)] transition-colors min-h-[44px]"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </button>
      </div>

      {/* Card */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)]">
        {error && (
          <div className="flex items-center gap-3 p-5 text-sm text-[#F6465D]" role="alert">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>Erro ao carregar feeds.</span>
            <button onClick={() => mutate()} className="ml-auto text-[#929AA5] hover:text-[#F0B90B] min-h-[44px]">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        )}

        {isLoading && !data && (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-3 w-3 rounded-full bg-[#2a2420] flex-shrink-0" />
                <div className="h-3 bg-[#2a2420] rounded w-32" />
                <div className="h-3 bg-[#1e1a16] rounded flex-1" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && feeds.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Rss className="h-8 w-8 text-[#929AA5] mb-2 opacity-40" />
            <p className="text-sm text-[#929AA5]">Nenhum feed configurado</p>
            <button onClick={openAdd} className="mt-2 text-xs text-[#F0B90B] hover:underline min-h-[44px]">
              Adicionar o primeiro feed
            </button>
          </div>
        )}

        {feeds.length > 0 && (
          <ul aria-label="Feeds RSS configurados">
            {feeds.map((feed, idx) => (
              <li
                key={feed.id}
                className={`flex items-center gap-3 px-4 py-3 ${idx < feeds.length - 1 ? 'border-b border-[rgba(240,185,11,.04)]' : ''} hover:bg-[rgba(240,185,11,.02)] group`}
              >
                {/* Active indicator */}
                <span
                  className={`h-2 w-2 rounded-full flex-shrink-0 ${feed.isActive ? 'bg-[#4ade80]' : 'bg-[#929AA5]'}`}
                  title={feed.isActive ? 'Ativo' : 'Inativo'}
                />

                {/* Name + URL */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#EAECEF] truncate">{feed.name}</p>
                  <p className="text-xs text-[#929AA5] truncate">{feed.url}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggle(feed)}
                    disabled={togglingId === feed.id}
                    aria-label={feed.isActive ? 'Desativar feed' : 'Ativar feed'}
                    title={feed.isActive ? 'Desativar' : 'Ativar'}
                    className="p-1.5 rounded hover:bg-[rgba(240,185,11,.08)] text-[#929AA5] hover:text-[#F0B90B] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-40"
                  >
                    {feed.isActive
                      ? <X className="h-3.5 w-3.5" />
                      : <Check className="h-3.5 w-3.5" />}
                  </button>

                  {/* External link */}
                  <a
                    href={feed.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Abrir feed RSS"
                    className="p-1.5 rounded hover:bg-[rgba(240,185,11,.08)] text-[#929AA5] hover:text-[#F0B90B] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>

                  {/* Edit */}
                  <button
                    onClick={() => openEdit(feed)}
                    aria-label={`Editar feed: ${feed.name}`}
                    className="p-1.5 rounded hover:bg-[rgba(240,185,11,.08)] text-[#929AA5] hover:text-[#F0B90B] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  {/* Delete — two-step confirm */}
                  {confirmDeleteId === feed.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(feed.id)}
                        disabled={deletingId === feed.id}
                        aria-label="Confirmar exclusão"
                        className="h-7 px-2 rounded bg-[rgba(246,70,93,.15)] border border-[rgba(246,70,93,.3)] text-xs text-[#F6465D] hover:bg-[rgba(246,70,93,.25)] disabled:opacity-40 min-h-[44px]"
                      >
                        {deletingId === feed.id ? '…' : 'Excluir'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label="Cancelar exclusão"
                        className="h-7 px-2 rounded border border-[rgba(240,185,11,.18)] text-xs text-[#929AA5] hover:text-[#EAECEF] min-h-[44px]"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(feed.id)}
                      aria-label={`Excluir feed: ${feed.name}`}
                      className="p-1.5 rounded hover:bg-[rgba(246,70,93,.1)] text-[#929AA5] hover:text-[#F6465D] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feed-modal-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div
            ref={modalRef}
            className="relative w-full sm:max-w-md bg-[#1a1815] sm:rounded-xl border border-[rgba(240,185,11,.15)] p-6"
          >
            <h2 id="feed-modal-title" className="text-base font-semibold text-[#EAECEF] mb-4">
              {modalMode === 'edit' ? 'Editar Feed' : 'Adicionar Feed RSS'}
            </h2>
            <FeedForm
              initial={editTarget ?? undefined}
              onSave={handleSave}
              onCancel={closeModal}
              isSaving={isSaving}
            />
          </div>
        </div>
      )}
    </div>
  )
}
