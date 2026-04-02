'use client'

// ============================================================================
// Foot Stock — PostList
// Lista paginada de posts com like optimistic update e delete com modal
// Fonte: module-18/TASK-2/ST003
// ============================================================================

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils/cn'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { MESSAGES } from '@/lib/constants/messages'
import { queryKeys } from '@/lib/constants/query-keys'
import { apiClient } from '@/lib/api/client'
import { formatRelativeDate } from '@/lib/utils/formatDate'
import type { ForumPostDTO, ForumSortOrder } from '@/lib/repositories/ForumRepository'
import type { AdminRole } from '@/lib/enums'

interface PostListProps {
  ticker?: string
  sort: ForumSortOrder
  currentUserId: string
  userAdminRole?: AdminRole | null
}

interface PostsResponse {
  items: ForumPostDTO[]
  meta: { hasNextPage: boolean; page: number }
}

export function PostList({ ticker, sort, currentUserId, userAdminRole }: PostListProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Reset page ao mudar filtros
  useEffect(() => {
    setPage(1)
  }, [ticker, sort])

  const queryKey = queryKeys.forum.list(ticker, sort, page)

  const { data, isLoading, isError, refetch } = useQuery<PostsResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ sort, page: String(page) })
      if (ticker) params.set('ticker', ticker)
      const res = await apiClient.get(`/api/v1/forum?${params.toString()}`)
      return res.data.data
    },
    staleTime: 30_000,
  })

  // ─── Like mutation com optimistic update ─────────────────────────────────
  const likeMutation = useMutation({
    mutationFn: (postId: string) => apiClient.post(`/api/v1/forum/${postId}/like`),
    onMutate: async (postId: string) => {
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueryData<PostsResponse>(queryKey)

      queryClient.setQueryData<PostsResponse>(queryKey, old => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map(p =>
            p.id === postId
              ? {
                  ...p,
                  likesCount: p.hasUserLiked ? p.likesCount - 1 : p.likesCount + 1,
                  hasUserLiked: !p.hasUserLiked,
                }
              : p
          ),
        }
      })
      return { snapshot }
    },
    onError: (_err, _postId, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(queryKey, context.snapshot)
      }
      toast.error(MESSAGES.FORUM.POST_LIKED_ERROR, MESSAGES.FORUM.POST_LIKED_ERROR_DESCRIPTION)
    },
  })

  // ─── Delete mutation ──────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (postId: string) => apiClient.delete(`/api/v1/forum/${postId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.forum.all })
      setDeleteTargetId(null)
    },
    onError: () => {
      toast.error(MESSAGES.FORUM.POST_DELETE_ERROR, MESSAGES.FORUM.POST_DELETE_ERROR_DESCRIPTION)
    },
  })

  // ─── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Carregando posts..." className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="min-h-[100px] bg-bg-elevated rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2 w-20" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    )
  }

  // ─── Error state ──────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div aria-live="assertive" className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-text-secondary text-sm">Erro ao carregar posts</p>
        <Btn size="sm" variant="secondary" onClick={() => refetch()}>
          Tentar novamente
        </Btn>
      </div>
    )
  }

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (!isLoading && data?.items.length === 0) {
    return (
      <EmptyState
        icon="MessageSquare"
        title="Seja o primeiro a publicar!"
        description="Compartilhe sua análise sobre algum ativo."
      />
    )
  }

  return (
    <>
      <ul className="space-y-4" aria-label="Lista de posts">
        {data?.items.map(post => {
          const isOwner = post.authorId === currentUserId
          const isAdmin = !!userAdminRole

          return (
            <li
              key={post.id}
              className="bg-bg-elevated border border-border-default rounded-xl p-4 space-y-3"
            >
              {/* Header: Avatar + autor + plano + ticker */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar
                    alt={`Avatar de ${post.authorName}`}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {post.authorName}
                    </p>
                    <Badge variant="plan" plan={post.authorPlan as never}>{post.authorPlan}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {post.ticker && (
                    <span
                      aria-label={`Ticker ${post.ticker}`}
                      className="text-xs bg-accent/10 text-accent border border-accent/30 rounded px-2 py-0.5"
                    >
                      {post.ticker}
                    </span>
                  )}
                  {(isOwner || isAdmin) && (
                    <button
                      type="button"
                      aria-label="Deletar post"
                      onClick={() => setDeleteTargetId(post.id)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-error transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Conteúdo */}
              <p className="text-sm text-slate-200 leading-relaxed">{post.content}</p>

              {/* Footer: likes + data */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  aria-label={post.hasUserLiked ? 'Remover curtida' : 'Curtir post'}
                  aria-pressed={post.hasUserLiked}
                  onClick={() => likeMutation.mutate(post.id)}
                  className="min-h-[44px] min-w-[44px] flex items-center gap-1.5 transition-colors"
                >
                  <svg
                    className={cn('w-4 h-4', post.hasUserLiked ? 'text-[#F0B90B]' : 'text-slate-400')}
                    viewBox="0 0 20 20"
                    fill={post.hasUserLiked ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={post.hasUserLiked ? 0 : 1.5}
                      d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                    />
                  </svg>
                  <span className={cn('text-xs', post.hasUserLiked ? 'text-[#F0B90B]' : 'text-slate-400')}>
                    {post.likesCount}
                  </span>
                </button>

                <span className="text-xs text-text-muted ml-auto">{formatRelativeDate(post.createdAt)}</span>
              </div>
            </li>
          )
        })}
      </ul>

      {/* Paginação explícita (mobile-safe — sem infinite scroll automático) */}
      {data?.meta.hasNextPage && (
        <div className="flex justify-center pt-4">
          <Btn
            size="sm"
            variant="secondary"
            onClick={() => setPage(p => p + 1)}
            className="min-h-[44px]"
          >
            Carregar mais
          </Btn>
        </div>
      )}

      {/* Modal de confirmação de delete */}
      <Modal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        title="Deletar post"
        description="Tem certeza que deseja deletar este post? Esta ação não pode ser desfeita."
        size="sm"
      >
        <div className="flex gap-3 justify-end pt-2">
          <Btn
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setDeleteTargetId(null)}
          >
            Cancelar
          </Btn>
          <Btn
            type="button"
            size="sm"
            onClick={() => deleteTargetId && deleteMutation.mutate(deleteTargetId)}
            aria-busy={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deletando...' : 'Confirmar'}
          </Btn>
        </div>
      </Modal>
    </>
  )
}
