// hooks/useNotifications.ts
// module-19 — Gerencia notificações com React Query + Supabase Realtime

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@supabase/ssr'
import { toast } from 'sonner'
import type { NotificationDTO } from '@/types'

interface UnreadCountResponse {
  count: number
}

interface NotificationsListResponse {
  data: NotificationDTO[]
  pagination: {
    page: number
    limit: number
    total: number
    hasNext: boolean
  }
}

async function fetchUnreadCount(): Promise<number> {
  const res = await fetch('/api/v1/notifications/unread-count')
  if (!res.ok) return 0
  const json = (await res.json()) as { data: UnreadCountResponse }
  return json.data.count
}

async function fetchNotifications(page: number): Promise<NotificationsListResponse> {
  const res = await fetch(`/api/v1/notifications?page=${page}`)
  if (!res.ok) throw new Error('Erro ao carregar notificações.')
  return res.json() as Promise<NotificationsListResponse>
}

async function patchMarkAsRead(id: string): Promise<NotificationDTO> {
  const res = await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' })
  if (!res.ok) throw new Error('Erro ao marcar notificação como lida.')
  const json = (await res.json()) as { data: NotificationDTO }
  return json.data
}

async function patchMarkAllAsRead(): Promise<void> {
  const res = await fetch('/api/v1/notifications/read-all', { method: 'PATCH' })
  if (!res.ok) throw new Error('Erro ao marcar todas como lidas.')
}

export function useNotifications(userId?: string | null) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [allNotifications, setAllNotifications] = useState<NotificationDTO[]>([])
  const [hasNextPage, setHasNextPage] = useState(false)
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false)
  const prevCountRef = useRef<number>(0)

  // Query: unread count
  const {
    data: unreadCount = 0,
    isLoading: isLoadingCount,
  } = useQuery<number>({
    queryKey: ['notifications:unread-count'],
    queryFn: fetchUnreadCount,
    staleTime: 30_000,
    refetchInterval: false,
    enabled: !!userId,
  })

  // Query: lista (page 1)
  const {
    data: page1Data,
    isLoading: isLoadingList,
  } = useQuery<NotificationsListResponse>({
    queryKey: ['notifications', 'list', 1],
    queryFn: () => fetchNotifications(1),
    staleTime: 30_000,
    enabled: !!userId,
  })

  useEffect(() => {
    if (!page1Data) return
    if (page === 1) {
      setAllNotifications(page1Data.data)
      setHasNextPage(page1Data.pagination.hasNext)
    }
  }, [page1Data, page])

  const fetchNextPage = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) return
    const nextPage = page + 1
    setIsFetchingNextPage(true)
    try {
      const data = await fetchNotifications(nextPage)
      setAllNotifications((prev) => [...prev, ...data.data])
      setHasNextPage(data.pagination.hasNext)
      setPage(nextPage)
    } finally {
      setIsFetchingNextPage(false)
    }
  }, [hasNextPage, isFetchingNextPage, page])

  // Supabase Realtime subscription
  useEffect(() => {
    if (!userId) return

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    let realtimeConnected = false
    let fallbackTimer: ReturnType<typeof setInterval> | null = null

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('broadcast', { event: 'NEW_NOTIFICATION' }, (payload) => {
        realtimeConnected = true
        if (fallbackTimer) {
          clearInterval(fallbackTimer)
          fallbackTimer = null
        }
        // Invalidar queries para refetch
        queryClient.invalidateQueries({ queryKey: ['notifications:unread-count'] })
        queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })

        // Adicionar nova notificação no início da lista
        const newNotification = payload.payload as NotificationDTO
        if (newNotification?.id) {
          setAllNotifications((prev) => [newNotification, ...prev])
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeConnected = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!realtimeConnected) {
            // Fallback polling 30s
            fallbackTimer = setInterval(() => {
              queryClient.invalidateQueries({ queryKey: ['notifications:unread-count'] })
              queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
            }, 30_000)
          }
        }
      })

    return () => {
      supabase.removeChannel(channel)
      if (fallbackTimer) clearInterval(fallbackTimer)
    }
  }, [userId, queryClient])

  // Bounce animation ao receber nova notificação
  const [isBouncing, setIsBouncing] = useState(false)
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setIsBouncing(true)
      const t = setTimeout(() => setIsBouncing(false), 2000)
      return () => clearTimeout(t)
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])

  // Mutation: markAsRead
  const markAsReadMutation = useMutation({
    mutationFn: patchMarkAsRead,
    onMutate: async (id) => {
      // Optimistic: decrementar count
      const prevCount = queryClient.getQueryData<number>(['notifications:unread-count'])
      queryClient.setQueryData<number>(['notifications:unread-count'], (old = 0) =>
        Math.max(0, old - 1)
      )
      // Optimistic: marcar na lista
      setAllNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
      return { prevCount }
    },
    onError: (_err, _id, context) => {
      // Reverter
      if (context?.prevCount !== undefined) {
        queryClient.setQueryData(['notifications:unread-count'], context.prevCount)
      }
      queryClient.invalidateQueries({ queryKey: ['notifications:unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
      toast.error('Erro ao marcar notificação. Tente novamente.')
    },
  })

  // Mutation: markAllAsRead
  const markAllAsReadMutation = useMutation({
    mutationFn: patchMarkAllAsRead,
    onMutate: async () => {
      const prevCount = queryClient.getQueryData<number>(['notifications:unread-count'])
      queryClient.setQueryData<number>(['notifications:unread-count'], 0)
      setAllNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      return { prevCount }
    },
    onSuccess: () => {
      toast.success('Todas as notificações foram marcadas como lidas')
    },
    onError: (_err, _vars, context) => {
      if (context?.prevCount !== undefined) {
        queryClient.setQueryData(['notifications:unread-count'], context.prevCount)
      }
      queryClient.invalidateQueries({ queryKey: ['notifications:unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
      toast.error('Erro ao marcar notificações. Tente novamente.')
    },
  })

  return {
    unreadCount,
    notifications: allNotifications,
    isLoading: isLoadingList || isLoadingCount,
    isFetchingNextPage,
    hasNextPage,
    isBouncing,
    fetchNextPage,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
    markAsReadError: markAsReadMutation.isError,
    markAllAsReadError: markAllAsReadMutation.isError,
    isError: !!markAsReadMutation.isError || !!markAllAsReadMutation.isError,
  }
}
