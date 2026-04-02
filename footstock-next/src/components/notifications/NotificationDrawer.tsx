'use client'

import { useEffect, useRef } from 'react'
import { Bell, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { NotificationItem } from './NotificationItem'
import { useNotifications } from '@/hooks/useNotifications'

interface NotificationDrawerProps {
  isOpen: boolean
  onClose: () => void
  userId?: string | null
}

export function NotificationDrawer({ isOpen, onClose, userId }: NotificationDrawerProps) {
  const {
    notifications,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    markAsRead,
    markAllAsRead,
    isMarkingAllAsRead,
  } = useNotifications(userId)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Foco no título ao abrir
  useEffect(() => {
    if (isOpen && titleRef.current) {
      titleRef.current.focus()
    }
  }, [isOpen])

  // Fechar com Escape
  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  // Bloquear scroll da página
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex"
      role="dialog"
      aria-modal="true"
      aria-label="Painel de notificações"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer — right-side no desktop, full-width no mobile */}
      <div
        className={cn(
          'relative ml-auto flex flex-col bg-[#181A20] border-l border-[rgba(240,185,11,.12)]',
          'w-full md:w-[360px] h-full overflow-hidden animate-slide-in-right'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-[rgba(240,185,11,.1)] flex-shrink-0">
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="text-base font-semibold text-[#EAECEF] outline-none"
          >
            Notificações
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              disabled={isMarkingAllAsRead}
              className="text-xs text-[#929AA5] hover:text-[#F0B90B] transition-colors disabled:opacity-40 px-2 py-1 rounded"
            >
              Marcar todas como lidas
            </button>
            <button
              onClick={onClose}
              aria-label="Fechar painel de notificações"
              className="p-1.5 rounded text-[#929AA5] hover:text-[#EAECEF] hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title="Nenhuma notificação ainda"
              description="As atividades da sua conta aparecerão aqui."
            />
          ) : (
            <div role="list" className="divide-y divide-[rgba(240,185,11,.06)]">
              {notifications.map((notification) => (
                <div key={notification.id} role="listitem">
                  <NotificationItem
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onClose={onClose}
                  />
                </div>
              ))}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-4" aria-hidden="true" />

              {isFetchingNextPage && (
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-16 w-full rounded-md" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
