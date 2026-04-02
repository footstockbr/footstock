'use client'

// ============================================================================
// Foot Stock — SponsorsPageClient
// Página de gestão de patrocinadores: lista + formulário de criação/edição.
// Fonte: module-24/TASK-3/ST007
// ============================================================================

import { useState } from 'react'
import { authedFetch } from '@/lib/api/authed-fetch'
import { SponsorList } from '@/components/admin/SponsorList'
import { BannerManager } from '@/components/admin/BannerManager'
import type { AdSponsorDto } from '@/lib/types/sponsors'

type View = 'list' | 'create' | 'edit'

export function SponsorsPageClient() {
  const [view, setView] = useState<View>('list')
  const [editTarget, setEditTarget] = useState<AdSponsorDto | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  function handleEdit(sponsor: AdSponsorDto) {
    setEditTarget(sponsor)
    setView('edit')
  }

  function requestDelete(id: string) {
    setPendingDeleteId(id)
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    setSuccessMsg(null)
    setErrorMsg(null)
    try {
      const res = await authedFetch(`/api/v1/admin/sponsors/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setErrorMsg(json.error ?? 'Falha ao remover patrocinador.')
        return
      }
      setSuccessMsg('Patrocinador removido.')
      setRefreshKey(k => k + 1)
    } catch {
      setErrorMsg('Erro de conexão ao remover patrocinador.')
    }
  }

  function handleFormSuccess() {
    const msg = view === 'create' ? 'Patrocinador criado com sucesso.' : 'Patrocinador atualizado.'
    setSuccessMsg(msg)
    setView('list')
    setEditTarget(null)
    setRefreshKey(k => k + 1)
  }

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Patrocinadores e Banners</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Gerencie campanhas publicitárias e posições de banner em 8 locais do app.
            </p>
          </div>
          {view === 'list' && (
            <button
              onClick={() => { setView('create'); setSuccessMsg(null) }}
              className="rounded-md bg-[#F0B90B] px-3 py-2 text-sm font-medium text-zinc-950"
            >
              + Novo patrocinador
            </button>
          )}
          {view !== 'list' && (
            <button
              onClick={() => { setView('list'); setEditTarget(null) }}
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300"
            >
              ← Voltar à lista
            </button>
          )}
        </div>
      </header>

      {successMsg && (
        <p className="rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">
          {successMsg}
        </p>
      )}
      {errorMsg && (
        <p className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {errorMsg}
        </p>
      )}

      {view === 'list' && (
        <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <SponsorList
            onEdit={handleEdit}
            onDelete={requestDelete}
            refresh={refreshKey}
          />
        </article>
      )}

      {(view === 'create' || view === 'edit') && (
        <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-4 text-sm font-semibold text-zinc-100">
            {view === 'create' ? 'Novo patrocinador' : `Editando: ${editTarget?.name ?? ''}`}
          </h2>
          <BannerManager
            initial={editTarget}
            onSuccess={handleFormSuccess}
            onCancel={() => { setView('list'); setEditTarget(null) }}
          />
        </article>
      )}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <h3 className="text-sm font-semibold text-zinc-100">Confirmar exclusão</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Tem certeza que deseja desativar este patrocinador? Os banners serão removidos imediatamente.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmDelete()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
