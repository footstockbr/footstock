'use client'
import { useEffect, useState } from 'react'

interface DividendStats {
  totalDistributed: number
  sportsDividends: number
  financialDividends: number
  topRecipients: Array<{ userId: string; username: string; amount: number }>
}

export function DividendMetrics() {
  const [stats, setStats] = useState<DividendStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/admin/engagement?section=dividends')
      .then((r) => r.json())
      .then((data) => setStats(data.dividends ?? null))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="h-32 rounded-lg bg-bg-card animate-pulse" />
  if (!stats) return null

  const formatFS = (v: number) =>
    `FS$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

  return (
    <div className="rounded-lg border border-border-default bg-bg-surface p-4 space-y-4">
      <h3 className="font-semibold text-text-primary text-sm">Dividendos</h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md bg-bg-card p-3 text-center">
          <p className="text-xs text-text-secondary mb-1">Total</p>
          <p className="text-sm font-bold text-text-primary">{formatFS(stats.totalDistributed)}</p>
        </div>
        <div className="rounded-md bg-bg-card p-3 text-center">
          <p className="text-xs text-text-secondary mb-1">Esportivo</p>
          <p className="text-sm font-bold text-text-primary">{formatFS(stats.sportsDividends)}</p>
        </div>
        <div className="rounded-md bg-bg-card p-3 text-center">
          <p className="text-xs text-text-secondary mb-1">Financeiro</p>
          <p className="text-sm font-bold text-text-primary">{formatFS(stats.financialDividends)}</p>
        </div>
      </div>
      {stats.topRecipients.length > 0 && (
        <div>
          <p className="text-xs text-text-secondary mb-2">Top Receptores</p>
          <div className="space-y-1">
            {stats.topRecipients.slice(0, 5).map((r, i) => (
              <div key={r.userId} className="flex justify-between text-xs">
                <span className="text-text-secondary">{i + 1}. {r.username}</span>
                <span className="text-text-primary font-medium">{formatFS(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
