'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface NewsStatusToggleProps {
  newsId: string
  currentStatus: 'published' | 'archived'
  onToggle: () => void
}

// Item 020 / F020-R1: a escrita de status vive fora do handler porque o harness de
// teste do repo roda em `testEnvironment: 'node'` (jest.config.ts) — sem jsdom nao
// ha clique para simular, e este e o unico ponto onde o verbo pode regredir.
//
// PATCH nos DOIS sentidos, nunca DELETE. Depois do DB-23 (item 020) o
// `DELETE /api/v1/admin/news/[id]` virou apagamento FISICO do GRUPO inteiro
// (`deleteMany` por group_id, ate 3 linhas irmas): um switch de status jamais pode
// destruir dado em definitivo, ainda mais sem caminho de volta. Verbo PATCH e nao
// PUT porque a rota so exporta PATCH e DELETE — o ramo antigo de restore mandava
// PUT e tomava 405.
export async function requestNewsStatusChange(
  newsId: string,
  nextStatus: 'published' | 'archived',
  fetcher: typeof fetch = fetch
): Promise<Response> {
  return fetcher(`/api/v1/admin/news/${newsId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPublished: nextStatus === 'published' }),
  })
}

export function NewsStatusToggle({ newsId, currentStatus, onToggle }: NewsStatusToggleProps) {
  const [loading, setLoading] = useState(false)
  const [optimisticStatus, setOptimisticStatus] = useState(currentStatus)

  async function handleToggle() {
    if (loading) return
    setLoading(true)

    const previousStatus = optimisticStatus
    const nextStatus = previousStatus === 'published' ? 'archived' : 'published'
    setOptimisticStatus(nextStatus)

    try {
      const res = await requestNewsStatusChange(newsId, nextStatus)

      if (res.ok) {
        onToggle()
      } else {
        setOptimisticStatus(previousStatus)
        window.alert(`Erro ao alterar status da notícia (${res.status}). Tente novamente.`)
      }
    } catch {
      setOptimisticStatus(previousStatus)
      window.alert('Erro de conexão ao alterar status da notícia. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const isPublished = optimisticStatus === 'published'

  return (
    // Wrapper: touch target mínimo 44×44 sem distorcer o visual do trilho
    <button
      role="switch"
      aria-checked={isPublished}
      aria-label={isPublished ? 'Arquivar notícia' : 'Publicar notícia'}
      disabled={loading}
      onClick={handleToggle}
      className={[
        'inline-flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] focus-visible:ring-offset-2 rounded-md',
        'disabled:cursor-not-allowed disabled:opacity-50',
      ].join(' ')}
    >
      {/* Trilho visual — dimensões independentes do touch target */}
      <span
        className={[
          'relative inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent',
          'transition-colors duration-200 ease-in-out',
          isPublished ? 'bg-[#4ade80]' : 'bg-[#707A8A]',
        ].join(' ')}
      >
        {/* Thumb */}
        <span
          className={[
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
            'transform transition duration-200 ease-in-out',
            isPublished ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        >
          {loading && (
            <Loader2 className="h-3 w-3 animate-spin text-[#929AA5] absolute inset-0.5" />
          )}
        </span>
      </span>
    </button>
  )
}
