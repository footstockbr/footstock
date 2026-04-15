'use client'

// ============================================================================
// Foot Stock — ShortForm
// Formulário para abrir e fechar posições SHORT (Lenda only).
// Margem: 150% do valor nocional. Aluguel: 0,5%/dia.
// Rastreabilidade: INT-014 / TASK-4/ST003
// ============================================================================

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, TrendingDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { useMarketTick } from '@/hooks/useMarketTick'
import { useMotorStatusContext } from '@/contexts/motor-status-context'
import { useAnalytics } from '@/hooks/useAnalytics'

const SHORT_MARGIN_RATIO = 1.5        // 150% de margem
const SHORT_DAILY_INTEREST_RATE = 0.005  // 0,5% ao dia

interface ShortFormProps {
  ticker: string
  assetName: string
  onSuccess?: () => void
  onClose?: () => void
}

interface OpenShortPosition {
  id: string
  ticker: string
  quantity: number
  avgPrice: number
  marginBlocked: number
  pnl: number
  interestAccrued: number
  marginRatio: number
}

export function ShortForm({ ticker, assetName, onSuccess, onClose }: ShortFormProps) {
  const { hasAccess, plan } = usePlanGuard()
  const tick = useMarketTick(ticker)
  const { isOffline: isMotorOffline } = useMotorStatusContext()
  const { track } = useAnalytics()

  const [mode, setMode] = useState<'open' | 'close'>('open')
  const [quantity, setQuantity] = useState('')
  const [positionId, setPositionId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openPosition, setOpenPosition] = useState<OpenShortPosition | null>(null)

  const currentPrice = tick?.lastPrice ?? 0
  const isLenda = hasAccess('LENDA')

  // Cálculos estimados para abertura
  const qty = Number(quantity)
  const notionalValue = qty > 0 && currentPrice > 0 ? qty * currentPrice : 0
  const marginRequired = notionalValue * SHORT_MARGIN_RATIO
  const dailyInterest = notionalValue * SHORT_DAILY_INTEREST_RATE

  // EVT-015: upgrade_prompt_shown — when the locked state is rendered
  useEffect(() => {
    if (!isLenda) {
      track('upgrade_prompt_shown', {
        feature_blocked: 'short_selling',
        current_plan: plan as 'JOGADOR' | 'CRAQUE' | 'LENDA',
        required_plan: 'LENDA',
      })
    }
  }, [isLenda, track, plan])

  // Guard de plano
  if (!isLenda) {
    return (
      <div className="p-4 space-y-3 text-center">
        <AlertTriangle className="w-8 h-8 text-[#F0B90B] mx-auto" />
        <p className="text-sm text-[#EAECEF] font-medium">Short Selling requer plano Lenda</p>
        <p className="text-xs text-[#929AA5]">
          Você está no plano <strong>{plan}</strong>. Faça upgrade para acessar short selling com margem, alavancagem e OCO.
        </p>
        <a
          href="/planos"
          className="inline-flex items-center justify-center w-full h-8 px-3 text-sm font-medium rounded-md bg-[#F0B90B] text-[#0B0E11] hover:bg-[#F0B90B]/90 transition-all"
          onClick={() => {
            // EVT-019: plan_upgrade_clicked
            track('plan_upgrade_clicked', {
              origin: 'short_selling',
              current_plan: plan as 'JOGADOR' | 'CRAQUE' | 'LENDA',
            })
          }}
        >
          Ver planos
        </a>
      </div>
    )
  }

  async function handleOpenShort() {
    if (!qty || qty < 1) {
      toast.error('Informe uma quantidade válida (mínimo 1).')
      return
    }
    if (currentPrice <= 0) {
      toast.error('Preço do ativo indisponível. Aguarde o motor.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/v1/positions/short', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, quantity: qty }),
      })

      const json = await res.json()

      if (!res.ok) {
        const msg = json?.error?.message ?? 'Erro ao abrir posição short.'
        toast.error(msg)
        return
      }

      const pos = json.data.position
      toast.success(`Short aberto: ${qty} ${ticker} @ FS$${pos.avgPrice.toFixed(2)}`)
      setOpenPosition({
        id: pos.id,
        ticker,
        quantity: pos.quantity,
        avgPrice: pos.avgPrice,
        marginBlocked: pos.marginBlocked,
        pnl: 0,
        interestAccrued: pos.interestAccrued,
        marginRatio: 100,
      })
      setQuantity('')
      onSuccess?.()
    } catch {
      toast.error('Erro de rede ao abrir short.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCloseShort() {
    const pid = openPosition?.id ?? positionId
    if (!pid) {
      toast.error('Informe o ID da posição para fechar.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/v1/positions/short/${pid}`, { method: 'DELETE' })
      const json = await res.json()

      if (!res.ok) {
        const msg = json?.error?.message ?? 'Erro ao fechar posição short.'
        toast.error(msg)
        return
      }

      const { pnl } = json.data
      const pnlLabel = pnl >= 0 ? `+FS$${pnl.toFixed(2)}` : `-FS$${Math.abs(pnl).toFixed(2)}`
      toast.success(`Short fechado. P&L: ${pnlLabel}`)
      setOpenPosition(null)
      setPositionId('')
      onSuccess?.()
    } catch {
      toast.error('Erro de rede ao fechar short.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-[#F6465D]" />
          <span className="font-bold text-[#EAECEF]">Short Selling — {ticker}</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-[#929AA5] hover:text-[#EAECEF]">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Banner motor offline */}
      {isMotorOffline && (
        <div className="flex items-center gap-2 text-sm text-white rounded-lg p-3" style={{ backgroundColor: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#f97316' }} />
          <span>Motor offline — posições Short suspensas temporariamente.</span>
        </div>
      )}

      {/* Alerta de risco */}
      <div className="bg-[#F6465D]/10 border border-[#F6465D]/30 rounded-lg p-3 space-y-1">
        <p className="text-xs text-[#F6465D] font-medium">Risco de perda ilimitada</p>
        <p className="text-xs text-[#929AA5]">
          Short selling exige margem de 150% do valor nocional. Aluguel diário: 0,5%.
          Liquidação automática ao consumir 100% da margem.
        </p>
      </div>

      {/* Tabs open/close */}
      <div className="flex rounded-lg overflow-hidden border border-[#2B3139]">
        <button
          onClick={() => setMode('open')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mode === 'open'
              ? 'bg-[#F6465D] text-white'
              : 'bg-[#1E2329] text-[#929AA5] hover:text-[#EAECEF]'
          }`}
        >
          Abrir Short
        </button>
        <button
          onClick={() => setMode('close')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mode === 'close'
              ? 'bg-[#2EBD85] text-[#0B0E11]'
              : 'bg-[#1E2329] text-[#929AA5] hover:text-[#EAECEF]'
          }`}
        >
          Fechar Short
        </button>
      </div>

      {mode === 'open' && (
        <div className="space-y-4">
          {/* Preço atual */}
          <div className="flex justify-between text-sm">
            <span className="text-[#929AA5]">Preço atual</span>
            <span className="text-[#EAECEF] font-medium">
              {currentPrice > 0 ? `FS$ ${currentPrice.toFixed(2)}` : 'Carregando…'}
            </span>
          </div>

          {/* Quantidade */}
          <div className="space-y-1">
            <label className="text-xs text-[#929AA5]">Quantidade</label>
            <Input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ex: 10"
              className="bg-[#1E2329] border-[#2B3139] text-[#EAECEF]"
            />
          </div>

          {/* Resumo */}
          {notionalValue > 0 && (
            <div className="bg-[#1E2329] rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#929AA5]">Valor nocional</span>
                <span className="text-[#EAECEF]">FS$ {notionalValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#929AA5]">Margem bloqueada (150%)</span>
                <span className="text-[#F6465D] font-medium">FS$ {marginRequired.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#929AA5]">Aluguel diário (0,5%)</span>
                <span className="text-[#929AA5]">FS$ {dailyInterest.toFixed(2)}/dia</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleOpenShort}
            disabled={isSubmitting || !qty || qty < 1 || currentPrice <= 0 || isMotorOffline}
            className="w-full bg-[#F6465D] hover:bg-[#F6465D]/90 text-white font-bold"
          >
            {isSubmitting ? 'Abrindo…' : isMotorOffline ? 'Motor offline — indisponível' : 'Abrir Posição Short'}
          </Button>
        </div>
      )}

      {mode === 'close' && (
        <div className="space-y-4">
          {openPosition ? (
            <div className="bg-[#1E2329] rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#929AA5]">Posição</span>
                <span className="text-[#EAECEF]">{openPosition.quantity} {ticker}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#929AA5]">Preço de abertura</span>
                <span className="text-[#EAECEF]">FS$ {openPosition.avgPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#929AA5]">Preço atual</span>
                <span className="text-[#EAECEF]">
                  {currentPrice > 0 ? `FS$ ${currentPrice.toFixed(2)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#929AA5]">Margem bloqueada</span>
                <span className="text-[#F6465D]">FS$ {openPosition.marginBlocked.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#929AA5]">Juros acumulados</span>
                <span className="text-[#929AA5]">FS$ {openPosition.interestAccrued.toFixed(4)}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-xs text-[#929AA5]">ID da posição (da lista de posições)</label>
              <Input
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
                placeholder="uuid da posição"
                className="bg-[#1E2329] border-[#2B3139] text-[#EAECEF] text-xs font-mono"
              />
            </div>
          )}

          <Button
            onClick={handleCloseShort}
            disabled={isSubmitting || (!openPosition && !positionId)}
            className="w-full bg-[#2EBD85] hover:bg-[#2EBD85]/90 text-[#0B0E11] font-bold"
          >
            {isSubmitting ? 'Fechando…' : 'Fechar Posição Short'}
          </Button>
        </div>
      )}
    </div>
  )
}
