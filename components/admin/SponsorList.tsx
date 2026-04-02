'use client'

// ============================================================================
// Foot Stock — SponsorList
// Lista de patrocinadores no painel admin.
// Fonte: module-24/TASK-3/ST005
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import type { AdSponsorDto } from '@/lib/types/sponsors'

interface SponsorListProps {
  onEdit: (sponsor: AdSponsorDto) => void
  onDelete: (id: string) => void
  refresh: number
}

export function SponsorList({ onEdit, onDelete, refresh }: SponsorListProps) {
  const [sponsors, setSponsors] = useState<AdSponsorDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/sponsors')
      if (!res.ok) throw new Error('fetch-failed')
      const json = (await res.json()) as { data: AdSponsorDto[] }
      setSponsors(json.data ?? [])
    } catch {
      setError('Não foi possível carregar os patrocinadores.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refresh])

  if (isLoading) {
    return <p className="text-sm text-zinc-400">Carregando patrocinadores...</p>
  }

  if (error) {
    return (
      <div className="flex items-center justify-between text-sm text-red-300">
        <p>{error}</p>
        <button
          onClick={() => void load()}
          className="ml-3 rounded-md border border-red-800 px-2 py-1 text-xs text-red-300 hover:border-red-600"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (sponsors.length === 0) {
    return <p className="text-sm text-zinc-500">Nenhum patrocinador cadastrado.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-zinc-400">
            <th className="px-3 py-2">Nome</th>
            <th className="px-3 py-2">Posições</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Vigência</th>
            <th className="px-3 py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {sponsors.map(s => {
            const positionCount = Object.keys(s.banners).length
            const isActive = s.active && new Date(s.endsAt) > new Date()
            return (
              <tr key={s.id} className="border-b border-zinc-800/60 text-zinc-200">
                <td className="px-3 py-2">
                  <p className="font-medium">{s.name}</p>
                </td>
                <td className="px-3 py-2">
                  <span className="text-zinc-400">{positionCount} posição{positionCount !== 1 ? 'ões' : ''}</span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      isActive
                        ? 'bg-emerald-900/40 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-zinc-400">
                  <p>{new Date(s.startsAt).toLocaleDateString('pt-BR')}</p>
                  <p>até {new Date(s.endsAt).toLocaleDateString('pt-BR')}</p>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEdit(s)}
                      className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onDelete(s.id)}
                      className="rounded-md border border-red-800 px-2 py-1 text-xs text-red-300 hover:border-red-600"
                    >
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
