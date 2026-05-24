'use client'

import { Bell } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { NotificationItem } from '@/components/notifications/NotificationItem'
import { useNotifications } from '@/hooks/useNotifications'
import { useEffect, useState } from 'react'

export default function InboxPage() {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/v1/auth/session', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active) setUserId(data?.user?.id ?? null)
      })
      .catch(() => {
        if (active) setUserId(null)
      })
    return () => {
      active = false
    }
  }, [])

  const {
    unreadCount,
    notifications,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    markAsRead,
    markAllAsRead,
    isMarkingAllAsRead,
    isError,
  } = useNotifications(userId)

  return (
    <div className="px-4 pt-4 max-w-2xl mx-auto" data-testid="page-inbox">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#EAECEF] flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#F0B90B]" aria-hidden="true" />
          Notificações
          {unreadCount > 0 && (
            <Badge variant="craque" size="xs">
              {unreadCount > 99 ? '99+' : unreadCount} {unreadCount === 1 ? 'nova' : 'novas'}
            </Badge>
          )}
        </h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            disabled={isMarkingAllAsRead}
            className="text-xs text-[#929AA5] hover:text-[#F0B90B] transition-colors disabled:opacity-40"
          >
            Marcar todas como lidas
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<Bell />}
          title="Erro ao carregar notificações"
          description="Não foi possível carregar as notificações. Tente novamente em instantes."
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="Nenhuma notificação ainda"
          description="As atividades da sua conta aparecerão aqui."
        />
      ) : (
        <div
          role="list"
          className="flex flex-col rounded-lg overflow-hidden border border-[rgba(240,185,11,.1)]"
          data-testid="inbox-list"
        >
          {notifications.map((notification, idx) => (
            <div
              key={notification.id}
              role="listitem"
              className={idx < notifications.length - 1 ? 'border-b border-[rgba(240,185,11,.06)]' : ''}
            >
              <NotificationItem
                notification={notification}
                onMarkAsRead={markAsRead}
                onClose={() => {}} // no drawer nesta página
              />
            </div>
          ))}

          {hasNextPage && (
            <button
              onClick={fetchNextPage}
              disabled={isFetchingNextPage}
              className="w-full py-3 text-xs text-[#929AA5] hover:text-[#F0B90B] transition-colors disabled:opacity-40"
            >
              {isFetchingNextPage ? 'Carregando...' : 'Ver mais'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
