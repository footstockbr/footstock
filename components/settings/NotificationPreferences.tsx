'use client'
import { useEffect, useState, useCallback } from 'react'

const NOTIFICATION_TYPES = [
  { key: 'orders', label: 'Ordens' },
  { key: 'news', label: 'Notícias' },
  { key: 'leagues', label: 'Ligas' },
  { key: 'payments', label: 'Pagamentos' },
  { key: 'system', label: 'Sistema' },
]

const CHANNELS = [
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'E-mail' },
  { key: 'in_app', label: 'In-App' },
]

type Preferences = Record<string, Record<string, boolean>>

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Preferences>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/v1/users/me/notification-preferences')
        if (res.ok) {
          const data = await res.json()
          // Normalize array format to object
          const normalized: Preferences = {}
          for (const type of NOTIFICATION_TYPES) {
            normalized[type.key] = {}
            for (const ch of CHANNELS) {
              const found = Array.isArray(data)
                ? data.find((p: {type: string, channel: string, enabled: boolean}) => p.type === type.key && p.channel === ch.key)
                : null
              normalized[type.key]![ch.key] = found ? found.enabled : true
            }
          }
          setPrefs(normalized)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const toggle = useCallback((type: string, channel: string) => {
    setPrefs((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type]?.[channel] },
    }))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const body = Object.entries(prefs).flatMap(([type, channels]) =>
        Object.entries(channels).map(([channel, enabled]) => ({ type, channel, enabled }))
      )
      const res = await fetch('/api/v1/users/me/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="h-48 rounded-lg bg-bg-card animate-pulse" />
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border-default">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default bg-bg-card">
              <th className="text-left py-3 px-4 text-text-secondary font-medium">Tipo</th>
              {CHANNELS.map((ch) => (
                <th key={ch.key} className="py-3 px-4 text-center text-text-secondary font-medium">{ch.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_TYPES.map((type) => (
              <tr key={type.key} className="border-b border-border-default last:border-0 hover:bg-bg-card/50">
                <td className="py-3 px-4 text-text-primary">{type.label}</td>
                {CHANNELS.map((ch) => (
                  <td key={ch.key} className="py-3 px-4 text-center">
                    <button
                      role="switch"
                      aria-checked={prefs[type.key]?.[ch.key] ?? true}
                      onClick={() => toggle(type.key, ch.key)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        prefs[type.key]?.[ch.key] ? 'bg-accent' : 'bg-border-default'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                          prefs[type.key]?.[ch.key] ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {saved && <span className="text-sm text-green-500">Preferências salvas!</span>}
      </div>
    </div>
  )
}
