'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// Item 24: comentarios por post no forum global. Hook separado de useForumPosts; carrega os
// comentarios de UM post sob demanda (enabled) quando o usuario expande o balao.

export interface ForumCommentView {
  id: string
  userId: string
  authorName: string
  content: string
  createdAt: string
}

interface CommentsResponse {
  data: ForumCommentView[]
}

async function fetchComments(postId: string): Promise<ForumCommentView[]> {
  const res = await fetch(`/api/v1/forum/${postId}/comments`)
  if (!res.ok) throw new Error('Erro ao carregar comentarios.')
  const json = (await res.json()) as CommentsResponse
  return json.data ?? []
}

async function postComment(postId: string, content: string): Promise<ForumCommentView> {
  const res = await fetch(`/api/v1/forum/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    const msg = json?.error?.message ?? json?.message ?? 'Erro ao comentar.'
    throw Object.assign(new Error(msg), { code: json?.error?.code, status: res.status })
  }
  const json = await res.json()
  return json.data
}

const STALE = 30_000

export function useForumComments(postId: string, enabled: boolean) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['forum-comments', postId],
    queryFn: () => fetchComments(postId),
    enabled,
    staleTime: STALE,
  })

  const addMutation = useMutation({
    mutationFn: (content: string) => postComment(postId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forum-comments', postId] })
    },
    onError: (err: Error & { status?: number }) => {
      toast.error(
        err.status === 429
          ? 'Você comentou muito rapidamente. Aguarde um pouco.'
          : err.message,
      )
    },
  })

  return {
    comments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    addComment: (content: string) => addMutation.mutateAsync(content),
    isAdding: addMutation.isPending,
  }
}
