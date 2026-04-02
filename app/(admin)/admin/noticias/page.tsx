'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { canAccess } from '@/lib/auth/canAccess'
import type { AdminRole } from '@/lib/enums'
import { NewsEditorPanel } from '@/components/admin/news/NewsEditorPanel'
import { NewsListSection } from '@/components/admin/news/NewsListSection'
import { EMPTY_FORM, STATUS_LABEL } from '@/components/admin/news/types'
import type { EditorialNews, EditorialStatus, FormState } from '@/components/admin/news/types'

export default function AdminNoticiasPage() {
  const router = useRouter()
  const [isAuthorizing, setIsAuthorizing] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [items, setItems] = useState<EditorialNews[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [statusFilter, setStatusFilter] = useState<'ALL' | EditorialStatus>('ALL')
  const [tickerFilter, setTickerFilter] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('status', statusFilter)
      if (tickerFilter.trim()) params.set('ticker', tickerFilter.trim().toUpperCase())
      if (fromFilter) params.set('from', fromFilter)
      if (toFilter) params.set('to', toFilter)
      const res = await fetch(`/api/v1/admin/news/editorial?${params.toString()}`)
      if (!res.ok) throw new Error('load-failed')
      const json = (await res.json()) as { data?: EditorialNews[] }
      setItems(json.data ?? [])
    } catch {
      setError('Não foi possível carregar notícias editoriais.')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, tickerFilter, fromFilter, toFilter])

  useEffect(() => {
    async function verifyRole() {
      try {
        const res = await fetch('/api/v1/admin/session/verify')
        if (!res.ok) { router.replace('/admin/login'); return false }
        const json = (await res.json()) as { adminRole?: AdminRole }
        if (!json.adminRole || !canAccess(json.adminRole, 'news:read')) {
          router.replace('/admin'); return false
        }
        return true
      } catch {
        router.replace('/admin/login'); return false
      } finally {
        setIsAuthorizing(false)
      }
    }
    void (async () => { const ok = await verifyRole(); if (!ok) return; await loadItems() })()
  }, [router, loadItems])

  function setFormField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function startEdit(item: EditorialNews) {
    setEditingId(item.id)
    setForm({
      title: item.title, content: item.content, ticker: item.ticker ?? '',
      impact: item.impact, sentiment: item.sentiment, source: item.source ?? '', status: item.status,
    })
    setError(null); setSuccess(null)
  }

  function clearForm() { setEditingId(null); setForm(EMPTY_FORM) }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true); setError(null); setSuccess(null)
    const payload = {
      title: form.title, content: form.content, ticker: form.ticker.toUpperCase(),
      impact: form.impact, sentiment: form.sentiment,
      source: form.source.trim() || undefined, status: form.status,
    }
    try {
      const res = await fetch(
        editingId ? `/api/v1/admin/news/editorial/${editingId}` : '/api/v1/admin/news/editorial',
        { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      )
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Não foi possível salvar a notícia.'); return
      }
      setSuccess(editingId ? 'Notícia atualizada com sucesso.' : 'Notícia criada com sucesso.')
      clearForm(); await loadItems()
    } catch { setError('Erro de conexão ao salvar notícia.')
    } finally { setIsSaving(false) }
  }

  async function updateStatus(item: EditorialNews, status: EditorialStatus) {
    setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/news/editorial/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Falha ao alterar status.'); return
      }
      setSuccess(`Notícia marcada como ${STATUS_LABEL[status].toLowerCase()}.`)
      await loadItems()
    } catch { setError('Erro de conexão ao alterar status.') }
  }

  async function deleteItem(item: EditorialNews) {
    if (!confirm(`Excluir a notícia "${item.title}"?`)) return
    setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/news/editorial/${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Falha ao excluir notícia.'); return
      }
      setSuccess('Notícia excluída com sucesso.')
      if (editingId === item.id) clearForm()
      await loadItems()
    } catch { setError('Erro de conexão ao excluir notícia.') }
  }

  if (isAuthorizing) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-24 w-full rounded-xl" aria-hidden="true" />
        <div className="skeleton h-72 w-full rounded-xl" aria-hidden="true" />
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h1 className="text-lg font-semibold text-zinc-100">Notícias (Editorial)</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Gestão editorial com publicar, editar, arquivar, filtros e exclusão com confirmação.
        </p>
      </header>

      {error && <p className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      {success && <p className="rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{success}</p>}

      <NewsEditorPanel
        editingId={editingId}
        form={form}
        isSaving={isSaving}
        onSubmit={(e) => void saveForm(e)}
        onFieldChange={setFormField}
        onCancelEdit={clearForm}
      />

      <NewsListSection
        items={items}
        isLoading={isLoading}
        statusFilter={statusFilter}
        tickerFilter={tickerFilter}
        fromFilter={fromFilter}
        toFilter={toFilter}
        onStatusFilterChange={setStatusFilter}
        onTickerFilterChange={setTickerFilter}
        onFromFilterChange={setFromFilter}
        onToFilterChange={setToFilter}
        onApplyFilters={() => void loadItems()}
        onEdit={startEdit}
        onUpdateStatus={(item, status) => void updateStatus(item, status)}
        onDelete={(item) => void deleteItem(item)}
      />
    </section>
  )
}
