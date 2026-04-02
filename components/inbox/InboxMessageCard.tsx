'use client'
import { useState } from 'react'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  createdAt: string
  read: boolean
}

interface Props {
  notification: Notification
  onRead: (id: string) => void
  onDelete: (id: string) => void
}

export function InboxMessageCard({ notification, onRead, onDelete }: Props) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleMarkRead = async () => {
    if (notification.read) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/me/notifications/${notification.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      })
      if (res.ok) onRead(notification.id)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/me/notifications/${notification.id}`, { method: 'DELETE' })
      if (res.ok) onDelete(notification.id)
    } finally {
      setLoading(false)
      setShowConfirm(false)
    }
  }

  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(notification.createdAt))

  return (
    <div
      className={`relative rounded-lg border p-4 transition-colors ${
        notification.read
          ? 'border-border-default bg-bg-surface'
          : 'border-accent/30 bg-accent/5 font-medium'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary truncate">{notification.title}</p>
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{notification.body}</p>
          <p className="text-xs text-text-secondary mt-1">{formattedDate}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!notification.read && (
            <button
              onClick={handleMarkRead}
              disabled={loading}
              className="text-xs text-accent hover:underline disabled:opacity-50"
              aria-label="Marcar como lida"
            >
              Lida
            </button>
          )}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded text-text-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
            aria-label="Deletar mensagem"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="absolute inset-0 rounded-lg bg-bg-surface/95 flex flex-col items-center justify-center gap-2 p-4 border border-red-300">
          <p className="text-sm text-text-primary text-center">Deletar esta mensagem?</p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-3 py-1.5 rounded bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50"
            >
              Deletar
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1.5 rounded border border-border-default text-xs text-text-secondary hover:bg-bg-card"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
