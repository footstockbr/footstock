'use client'
import { useEffect, useState } from 'react'
import { authedFetch } from '@/lib/api/authed-fetch'
import { InboxMessageCard } from './InboxMessageCard'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  createdAt: string
  read: boolean
}

export function InboxPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authedFetch('/api/v1/me/notifications')
        if (res.ok) {
          const data = await res.json()
          setNotifications(data.notifications ?? data ?? [])
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const handleDelete = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      const res = await authedFetch('/api/v1/me/notifications', { method: 'PATCH' })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      }
    } finally {
      setMarkingAll(false)
    }
  }

  const hasUnread = notifications.some((n) => !n.read)

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-bg-card animate-pulse" />
        ))}
      </div>
    )
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <svg className="w-12 h-12 text-text-secondary mb-3" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
        </svg>
        <p className="text-text-secondary text-sm">Nenhuma mensagem</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-secondary">{notifications.length} mensagem(s)</p>
        {hasUnread && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            {markingAll ? 'Marcando...' : 'Marcar todas como lidas'}
          </button>
        )}
      </div>
      {notifications.map((n) => (
        <InboxMessageCard key={n.id} notification={n} onRead={handleRead} onDelete={handleDelete} />
      ))}
    </div>
  )
}
