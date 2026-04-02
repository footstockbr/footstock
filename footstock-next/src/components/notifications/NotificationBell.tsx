'use client'

import { useState, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'
import { usePushRegistration } from '@/hooks/usePushRegistration'
import { NotificationDrawer } from './NotificationDrawer'

interface NotificationBellProps {
  className?: string
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // Obter userId da sessão Supabase no client
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  usePushRegistration(userId)
  const { unreadCount, isBouncing } = useNotifications(userId)

  const ariaLabel = unreadCount > 0
    ? `Notificações. ${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}.`
    : 'Notificações'

  const badgeCount = unreadCount > 99 ? '99+' : unreadCount

  return (
    <>
      <button
        data-testid="header-notification-button"
        onClick={() => setIsDrawerOpen(true)}
        className={cn(
          'relative p-2 min-w-[44px] min-h-[44px] rounded-full',
          'hover:bg-white/5 transition-colors',
          'flex items-center justify-center text-[#929AA5] hover:text-[#EAECEF]',
          className
        )}
        aria-label={ariaLabel}
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute top-0 right-0 min-w-[18px] h-[18px] px-1',
              'bg-[#F0B90B] text-[#0B0E11] rounded-full text-[10px] font-bold',
              'flex items-center justify-center pointer-events-none',
              isBouncing && 'animate-bounce'
            )}
            aria-hidden="true"
          >
            {badgeCount}
          </span>
        )}
      </button>

      <NotificationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        userId={userId}
      />
    </>
  )
}
