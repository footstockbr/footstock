'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { ROUTES } from '@/lib/constants/routes'
import { PLAN_LABELS } from '@/lib/constants/labels'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativa', color: 'text-emerald-400' },
  CANCELLED: { label: 'Cancelada', color: 'text-zinc-400' },
  EXPIRED: { label: 'Expirada', color: 'text-zinc-500' },
  CANCELLATION_LOCK: { label: 'Trava de cancelamento', color: 'text-amber-400' },
  PENDING: { label: 'Pendente', color: 'text-blue-400' },
  TRIAL: { label: 'Trial', color: 'text-purple-400' },
  SUSPENDED: { label: 'Suspensa', color: 'text-red-400' },
}

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pago', color: 'text-emerald-400' },
  pending: { label: 'Pendente', color: 'text-amber-400' },
  failed: { label: 'Falhou', color: 'text-red-400' },
  refunded: { label: 'Reembolsado', color: 'text-blue-400' },
}

interface Payment {
  id: string
  amountBRL: string
  status: string
  transactionId: string | null
  paidAt: string
}

interface Subscription {
  id: string
  planType: string
  gateway: string
  period: string
  amountBRL: string
  status: string
  startsAt: string
  expiresAt: string
  cancelledAt: string | null
  createdAt: string
  payments: Payment[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function HistoricoPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient.get('/api/v1/subscriptions/history')
      .then((r) => {
        const data = r.data as { success: boolean; data?: Subscription[] }
        if (data.success) setSubscriptions(data.data ?? [])
        else setError('Erro ao carregar histórico.')
      })
      .catch(() => setError('Erro de conexão.'))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Histórico de Assinaturas</h1>
          <p className="mt-1 text-sm text-text-secondary">Todas as suas assinaturas e pagamentos.</p>
        </div>
        <Link
          href={ROUTES.PLANOS}
          className="rounded-md border border-border-default px-3 py-1.5 text-sm text-text-primary hover:border-accent transition-colors"
        >
          Voltar
        </Link>
      </header>

      {isLoading && <p className="text-sm text-text-muted">Carregando...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!isLoading && !error && subscriptions.length === 0 && (
        <p className="text-sm text-text-muted">Nenhuma assinatura encontrada.</p>
      )}

      {subscriptions.map((sub) => {
        const statusInfo = STATUS_LABELS[sub.status] ?? { label: sub.status, color: 'text-zinc-400' }
        return (
          <div key={sub.id} className="rounded-xl border border-border-default bg-bg-elevated p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-text-primary">{(PLAN_LABELS as Record<string, string>)[sub.planType] ?? sub.planType}</p>
                <p className="text-xs text-text-muted capitalize">
                  {sub.period === 'monthly' ? 'Mensal' : 'Anual'} · {sub.gateway}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-text-primary">R$ {sub.amountBRL}</p>
                <p className={`text-xs ${statusInfo.color}`}>{statusInfo.label}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 text-xs text-text-secondary">
              <span>Início: {formatDate(sub.startsAt)}</span>
              <span>Vencimento: {formatDate(sub.expiresAt)}</span>
              {sub.cancelledAt && <span className="col-span-2 text-zinc-500">Cancelada em: {formatDate(sub.cancelledAt)}</span>}
            </div>

            {sub.payments.length > 0 && (
              <div className="border-t border-border-default pt-2">
                <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">Pagamentos</p>
                <div className="space-y-1">
                  {sub.payments.map((p) => {
                    const pInfo = PAYMENT_STATUS_LABELS[p.status] ?? { label: p.status, color: 'text-zinc-400' }
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">{formatDate(p.paidAt)}</span>
                        <span className="text-text-primary">R$ {p.amountBRL}</span>
                        <span className={pInfo.color}>{pInfo.label}</span>
                        {p.transactionId && (
                          <span className="truncate max-w-[120px] text-text-muted" title={p.transactionId}>
                            #{p.transactionId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
