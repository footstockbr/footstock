'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { authedFetch } from '@/lib/api/authed-fetch'
import { ROUTES } from '@/lib/constants/routes'
import { NOTIFICATION_POLL_MS } from '@/lib/constants/timing'

export function InboxIcon() {
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnreadCount = async () => {
    try {
      const res = await authedFetch('/api/v1/me/notifications?unread=true&count=true')
      if (res.ok) {
        const data = await res.json()
        setUnreadCount(data.count ?? 0)
      }
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, NOTIFICATION_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <Link
      href={ROUTES.INBOX ?? '/inbox'}
      className="relative w-9 h-9 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-card transition-colors"
      aria-label={unreadCount > 0 ? `Inbox — ${unreadCount} não lidas` : 'Inbox'}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
      </svg>
      {unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
          aria-hidden="true"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  )
}
