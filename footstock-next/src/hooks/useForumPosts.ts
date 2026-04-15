'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ForumPostAPI {
  id: string
  userId: string
  content: string
  ticker: string | null
  isFlagged: boolean
  flagCount: number
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export interface ForumPostView {
  id: string
  userId: string
  authorName: string
  content: string
  ticker: string | null
  likesCount: number
  hasUserLiked: boolean
  createdAt: string
}

interface PaginationMeta {
  page: number
  limit: number
  total: number
  hasNext: boolean
}

interface ForumListResponse {
  data: ForumPostView[]
  pagination: PaginationMeta
}

interface LikeResponse {
  data: { liked: boolean; likes: number }
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchPosts(
  page: number,
  sort: string,
  ticker?: string
): Promise<ForumListResponse> {
  const params = new URLSearchParams({ page: String(page), sort })
  if (ticker) params.set('ticker', ticker)
  const res = await fetch(`/api/v1/forum?${params}`)
  if (!res.ok) throw new Error('Erro ao carregar posts.')
  return res.json()
}

async function createPost(data: {
  content: string
  ticker?: string
}): Promise<ForumPostAPI> {
  const res = await fetch('/api/v1/forum', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    const msg =
      json?.error?.message ?? json?.message ?? 'Erro ao publicar.'
    throw Object.assign(new Error(msg), { code: json?.error?.code, status: res.status })
  }
  const json = await res.json()
  return json.data
}

async function toggleLike(postId: string): Promise<LikeResponse> {
  const res = await fetch(`/api/v1/forum/${postId}/like`, { method: 'POST' })
  if (!res.ok) throw new Error('Erro ao curtir.')
  return res.json()
}

async function deletePost(postId: string): Promise<void> {
  const res = await fetch(`/api/v1/forum/${postId}`, { method: 'DELETE' })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json?.error?.message ?? 'Erro ao excluir post.')
  }
}

async function flagPost(postId: string): Promise<{ autoDeleted: boolean }> {
  const res = await fetch(`/api/v1/forum/${postId}/flag`, { method: 'POST' })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json?.error?.message ?? 'Erro ao denunciar post.')
  }
  const json = await res.json()
  return json.data
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const STALE = 30_000

export function useForumPosts(initialSort = 'recentes') {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState(initialSort)
  const [ticker, setTicker] = useState<string | undefined>()

  const queryKey = ['forum-posts', page, sort, ticker]

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchPosts(page, sort, ticker),
    staleTime: STALE,
  })

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['forum-posts'] })
  }, [qc])

  // ── Create ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      invalidate()
      toast.success('Post publicado!')
    },
    onError: (err: Error & { status?: number }) => {
      if (err.status === 429) {
        toast.error('Limite de publicações atingido. Tente novamente mais tarde.')
      } else {
        toast.error(err.message)
      }
    },
  })

  // ── Like toggle ───────────────────────────────────────────────────────────
  const likeMutation = useMutation({
    mutationFn: toggleLike,
    onSuccess: () => {
      invalidate()
    },
  })

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: deletePost,
    onSuccess: () => {
      invalidate()
      toast.success('Post excluído.')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // ── Flag ──────────────────────────────────────────────────────────────────
  const flagMutation = useMutation({
    mutationFn: flagPost,
    onSuccess: (result) => {
      invalidate()
      toast.success(
        result.autoDeleted
          ? 'Denúncia registrada. O post foi removido automaticamente.'
          : 'Denúncia registrada. Obrigado por reportar.'
      )
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  return {
    posts: data?.data ?? [],
    pagination: data?.pagination ?? null,
    isLoading,
    isError,
    page,
    sort,
    ticker,
    setPage,
    setSort: (s: string) => { setSort(s); setPage(1) },
    setTicker: (t: string | undefined) => { setTicker(t); setPage(1) },

    createPost: (content: string, postTicker?: string) =>
      createMutation.mutateAsync({ content, ticker: postTicker }),
    isCreating: createMutation.isPending,

    toggleLike: (postId: string) => likeMutation.mutate(postId),

    deletePost: (postId: string) => deleteMutation.mutate(postId),
    isDeleting: deleteMutation.isPending,

    flagPost: (postId: string) => flagMutation.mutate(postId),
  }
}
