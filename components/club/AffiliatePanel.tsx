'use client'
// ============================================================================
// Foot Stock — AffiliatePanel
// Painel de royalties e link de afiliado do clube parceiro.
// Rastreabilidade: INT-084, US-036, TASK-2/ST005
// ============================================================================

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/Card'
import { COPY_FEEDBACK_MS } from '@/lib/constants/timing'

interface RoyaltyEntry {
  id: string
  period: string
  amount: number
  status: 'PENDENTE' | 'PAGO'
}

interface AffiliatePanelProps {
  clubId: string
  royalties?: RoyaltyEntry[]
  totalRoyalties?: number
  isLoading?: boolean
}

export function AffiliatePanel({ clubId, royalties, totalRoyalties, isLoading }: AffiliatePanelProps) {
  const [copied, setCopied] = useState(false)
  const referralLink = `https://footstock.app/ref/time/${clubId.toLowerCase()}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    } catch {
      window.prompt('Copie o link manualmente:', referralLink)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-5 w-48 rounded" />
        <Skeleton className="h-[120px] w-full rounded-lg" />
        <Skeleton className="h-[80px] w-full rounded-lg" />
      </div>
    )
  }

  const hasRoyalties = royalties && royalties.length > 0

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-zinc-100">Painel de Afiliado</h3>

      {/* Link de referral */}
      <Card className="flex flex-col gap-3">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Link do time</span>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-hidden text-ellipsis rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
            {referralLink}
          </code>
          <button
            type="button"
            aria-label="Copiar link de afiliado"
            onClick={handleCopy}
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

      {/* Royalties */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Royalties acumulados</span>
          {typeof totalRoyalties === 'number' && (
            <span className="text-sm font-semibold text-[#C9A84C]">
              FS$ {totalRoyalties.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>

        {!hasRoyalties ? (
          <EmptyState title="Nenhum royalty registrado." description="Compartilhe seu link para começar." />
        ) : (
          <div className="space-y-2">
            {royalties.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{r.period}</span>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-200">
                    FS$ {r.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span
                    className={
                      r.status === 'PAGO'
                        ? 'rounded bg-green-900/30 px-2 py-0.5 text-xs text-green-400'
                        : 'rounded bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-400'
                    }
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
