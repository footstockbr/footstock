'use client'
// ============================================================================
// Foot Stock — AffiliateMetrics
// KPIs do influenciador: signups, conversões pagas, comissão total, taxa.
// Rastreabilidade: INT-084, US-036, TASK-3/ST004
// ============================================================================

import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import type { AffiliateMetrics as AffiliateMetricsData } from '@/types/club'
import { COPY_FEEDBACK_MS } from '@/lib/constants/timing'

interface AffiliateMetricsProps {
  metrics: AffiliateMetricsData | null
  isLoading?: boolean
}

const ptBR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 })

export function AffiliateMetrics({ metrics, isLoading }: AffiliateMetricsProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = async () => {
    if (!metrics?.referralLink) return
    try {
      await navigator.clipboard.writeText(`https://${metrics.referralLink}`)
      setCopied(true)
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    } catch {
      window.prompt('Copie o link manualmente:', `https://${metrics.referralLink}`)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[80px] w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <Card className="py-8 text-center text-sm text-zinc-500">
        Não foi possível carregar as métricas. Tente novamente.
      </Card>
    )
  }

  const kpis = [
    {
      label: 'Cadastros via link',
      value: metrics.totalSignups.toString(),
      sub: 'Total de novos usuários',
    },
    {
      label: 'Conversões pagas',
      value: metrics.paidConversions.toString(),
      sub: 'Planos ativos com comissão',
    },
    {
      label: 'Comissão acumulada',
      value: `FS$ ${ptBR.format(metrics.totalCommissionFS)}`,
      sub: 'Total em Foot Stock Coins',
    },
    {
      label: 'Taxa de comissão',
      value: `${(metrics.commissionPct * 100).toFixed(0)}%`,
      sub: 'Por conversão paga',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Link de referral */}
      <Card className="flex flex-col gap-3">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Seu link de afiliado</span>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-hidden text-ellipsis rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
            {metrics.referralLink}
          </code>
          <button
            type="button"
            aria-label="Copiar link de afiliado"
            onClick={handleCopyLink}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm transition-colors hover:border-[#C9A84C] hover:text-[#C9A84C]"
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
        </div>
        {copied && (
          <p className="text-xs text-green-400" role="status" aria-live="polite">
            Link copiado!
          </p>
        )}
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">{kpi.label}</span>
            <span className="text-xl font-bold text-[#C9A84C]">{kpi.value}</span>
            <span className="text-xs text-zinc-600">{kpi.sub}</span>
          </Card>
        ))}
      </div>
    </div>
  )
}
