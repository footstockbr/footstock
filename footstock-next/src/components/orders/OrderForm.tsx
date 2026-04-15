'use client'

import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Clock, WalletMinimal } from 'lucide-react'
import { InfoTip } from '@/components/ui/info-tip'
import { GlossaryInfoIcon } from '@/components/ui/glossary-info-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LeverageToggle } from '@/components/orders/LeverageToggle'
import { useMotorStatusContext } from '@/contexts/motor-status-context'
import { useMarketSession } from '@/hooks/useMarketSession'
import { useMarketTick } from '@/hooks/useMarketTick'
import { usePlanGuard, type PlanTier } from '@/hooks/usePlanGuard'
import { useBalance } from '@/hooks/useBalance'
import { useAnalytics } from '@/hooks/useAnalytics'
import { calculateFee } from '@/lib/constants/limits'
import { MarketSession } from '@/lib/constants/market'
import type { OrderType } from '@/lib/analytics'

// ── Constants mirrored from lib/services/plan-order-limits.ts ────────────────
const ALLOWED_ORDER_TYPES: Record<PlanTier, string[]> = {
  JOGADOR: ['MARKET'],
  CRAQUE: ['MARKET', 'LIMIT', 'SCHEDULED'],
  LENDA: ['MARKET', 'LIMIT', 'OCO', 'SCHEDULED'],
}

const DAILY_ORDER_LIMITS: Record<PlanTier, number> = {
  JOGADOR: 2,
  CRAQUE: 5,
  LENDA: Infinity,
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  MARKET: 'Mercado',
  LIMIT: 'Limitada',
  OCO: 'OCO',
  SCHEDULED: 'Agendada',
}

// ── Props ────────────────────────────────────────────────────────────────────

interface OrderFormProps {
  ticker: string
  side: 'BUY' | 'SELL'
  onSuccess?: () => void
  onClose?: () => void
  dailyOrdersUsed?: number
  /** Saldo FS$ atual do usuário. Se omitido, o componente busca via /api/v1/me (T-019) */
  fsBalance?: number
}

export function OrderForm({ ticker, side, onSuccess, onClose, dailyOrdersUsed = 0, fsBalance: fsBalanceProp }: OrderFormProps) {
  const { plan, hasAccess } = usePlanGuard()
  const { isOffline } = useMotorStatusContext()
  const { session } = useMarketSession()
  const tick = useMarketTick(ticker)
  const { fsBalance: fsBalanceFetched } = useBalance()
  const { track } = useAnalytics()
  // Usar prop se fornecida (evita fetch extra); caso contrário usar hook
  const fsBalance = fsBalanceProp !== undefined ? fsBalanceProp : (fsBalanceFetched ?? null)

  const allowedTypes = ALLOWED_ORDER_TYPES[plan]
  const dailyLimit = DAILY_ORDER_LIMITS[plan]
  const isLenda = hasAccess('LENDA')

  const [orderType, setOrderType] = useState(allowedTypes[0])
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [stopLossPrice, setStopLossPrice] = useState('')
  const [takeProfitPrice, setTakeProfitPrice] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [leverageEnabled, setLeverageEnabled] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Contador de ordens restantes — inicializado pelo prop; auto-buscado se prop for 0 (valor default)
  const initialRemaining = dailyLimit === Infinity ? Infinity : Math.max(0, dailyLimit - dailyOrdersUsed)
  const [ordersRemaining, setOrdersRemaining] = useState<number>(initialRemaining)

  // Auto-fetch do contador quando o componente monta sem dailyOrdersUsed explícito
  useEffect(() => {
    if (dailyLimit === Infinity) return // Lenda: sem limite, sem fetch
    fetch('/api/v1/orders/daily-count')
      .then((r) => r.json())
      .then((body) => {
        const remaining = body?.data?.remaining
        if (typeof remaining === 'number') setOrdersRemaining(remaining)
      })
      .catch(() => { /* Silencioso — valor inicial do prop é usado como fallback */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // EVT-011: rastrear abertura do formulario de ordem
  useEffect(() => {
    track('order_form_opened', {
      asset_ticker: ticker,
      order_type: orderType as OrderType,
      side,
      plan,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentPrice = tick?.lastPrice ?? 0
  // MARKET orders aceitos em TRADING e CLOSING_CALL (call de fechamento também é pregão aberto)
  const isMarketClosed = session !== MarketSession.TRADING && session !== MarketSession.CLOSING_CALL
  const isMarketDisabled = orderType === 'MARKET' && isMarketClosed
  const atDailyLimit = ordersRemaining <= 0 && dailyLimit !== Infinity
  // T-019: saldo zero ou negativo bloqueia novas ordens BUY
  const isBalanceZero = side === 'BUY' && fsBalance !== null && fsBalance <= 0

  // Custo estimado (alavancagem reduz capital proprio necessario para 50%)
  const estimatedCost = useMemo(() => {
    const qty = Number(quantity)
    if (!qty || qty <= 0) return null
    const unitPrice = orderType === 'MARKET' ? currentPrice : Number(price)
    if (!unitPrice || unitPrice <= 0) return null
    const operationValue = qty * unitPrice
    const fee = calculateFee(operationValue)
    const ownCapital = side === 'BUY' && leverageEnabled ? operationValue / 2 : operationValue
    return { operationValue, fee, total: ownCapital + fee, leverageEnabled }
  }, [quantity, price, orderType, currentPrice, leverageEnabled, side])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    const qty = Number(quantity)

    if (!qty || qty < 1 || !Number.isInteger(qty)) {
      errs.quantity = 'Quantidade deve ser um numero inteiro positivo.'
    }

    if (orderType === 'LIMIT') {
      if (!Number(price) || Number(price) <= 0) {
        errs.price = 'Preco limite obrigatorio.'
      }
    }

    if (orderType === 'OCO') {
      if (!Number(price) || Number(price) <= 0) errs.price = 'Preco obrigatorio.'
      if (!Number(stopLossPrice) || Number(stopLossPrice) <= 0) errs.stopLossPrice = 'Stop Loss obrigatorio.'
      if (!Number(takeProfitPrice) || Number(takeProfitPrice) <= 0) errs.takeProfitPrice = 'Take Profit obrigatorio.'

      if (Number(price) > 0 && Number(stopLossPrice) > 0 && Number(takeProfitPrice) > 0) {
        if (side === 'BUY') {
          if (!(Number(stopLossPrice) < Number(price) && Number(price) < Number(takeProfitPrice))) {
            errs.stopLossPrice = 'BUY OCO: Stop Loss < Preco < Take Profit.'
          }
        } else {
          if (!(Number(takeProfitPrice) < Number(price) && Number(price) < Number(stopLossPrice))) {
            errs.stopLossPrice = 'SELL OCO: Take Profit < Preco < Stop Loss.'
          }
        }
      }
    }

    if (orderType === 'SCHEDULED') {
      if (!scheduledAt) {
        errs.scheduledAt = 'Data de agendamento obrigatoria.'
      } else if (new Date(scheduledAt) <= new Date()) {
        errs.scheduledAt = 'Data deve ser no futuro.'
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        ticker,
        type: orderType,
        side,
        quantity: Number(quantity),
      }

      // Alavancagem: apenas BUY Lenda com toggle ativo
      if (side === 'BUY' && leverageEnabled && isLenda) {
        body.leverage = 2
      }

      if (orderType === 'LIMIT' || orderType === 'OCO') {
        body.price = Number(price)
      }
      if (orderType === 'OCO') {
        body.stopLossPrice = Number(stopLossPrice)
        body.takeProfitPrice = Number(takeProfitPrice)
      }
      if (orderType === 'SCHEDULED') {
        body.scheduledAt = new Date(scheduledAt).toISOString()
        if (Number(price) > 0) body.price = Number(price)
      }

      const res = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Erro ${res.status}`)
      }

      // EVT-012: rastrear ordem enviada com sucesso
      const estValue = estimatedCost?.operationValue ?? 0
      const valueBracket: '0-500' | '500-1000' | '1000+' =
        estValue >= 1000 ? '1000+' : estValue >= 500 ? '500-1000' : '0-500'
      track('order_submitted', {
        asset_ticker: ticker,
        order_type: orderType as OrderType,
        side,
        plan,
        value_bracket: valueBracket,
      })

      // Atualizar contador de ordens restantes a partir do header da resposta
      const remainingHeader = res.headers.get('X-DailyOrder-Remaining')
      if (remainingHeader !== null && remainingHeader !== 'unlimited') {
        setOrdersRemaining(parseInt(remainingHeader, 10))
      }

      toast.success(
        side === 'BUY'
          ? `Ordem de compra de ${ticker} enviada!`
          : `Ordem de venda de ${ticker} enviada!`
      )
      onSuccess?.()
      onClose?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar ordem.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isBuy = side === 'BUY'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4" data-testid="order-form" data-tour="order-form">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[#EAECEF] font-semibold text-lg">
          {isBuy ? 'Comprar' : 'Vender'}{' '}
          <span className={isBuy ? 'text-[#2EBD85]' : 'text-[#F6465D]'}>{ticker}</span>
        </h2>
        {currentPrice > 0 && (
          <span className="text-sm text-[#929AA5]">
            Preco atual: <span className="text-[#EAECEF] font-mono">FS$ {currentPrice.toFixed(2)}</span>
          </span>
        )}
      </div>

      {/* Daily limit counter + saldo atual */}
      <div className="flex items-center justify-between text-xs text-[#707A8A]">
        <span>
          {dailyLimit === Infinity
            ? 'Ordens ilimitadas hoje'
            : ordersRemaining > 0
              ? `${ordersRemaining} ordem${ordersRemaining !== 1 ? 's' : ''} restante${ordersRemaining !== 1 ? 's' : ''} hoje`
              : 'Limite diario atingido'}
        </span>
        {fsBalance !== null && (
          <span className={`flex items-center gap-1 font-mono ${fsBalance <= 0 ? 'text-[#F6465D] font-semibold' : 'text-[#929AA5]'}`}>
            <WalletMinimal className="h-3 w-3" aria-hidden="true" />
            FS$ {fsBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* T-019: banner saldo zerado — visivel apenas em BUY */}
      {isBalanceZero && (
        <div
          role="alert"
          data-testid="balance-zero-banner"
          className="flex items-center gap-2 text-sm text-[#F6465D] bg-[rgba(246,70,93,.08)] border border-[rgba(246,70,93,.2)] p-3 rounded-lg"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>Saldo zerado — venda posicoes para negociar novamente.</span>
        </div>
      )}

      {/* Order type selector */}
      <div role="group" aria-label="Tipo de ordem" className="flex gap-2" data-tour="order-type-selector">
        {allowedTypes.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={orderType === t}
            onClick={() => { setOrderType(t); setErrors({}) }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              orderType === t
                ? 'bg-[rgba(240,185,11,.15)] text-[#F0B90B] border border-[rgba(240,185,11,.4)]'
                : 'bg-[#1E2329] text-[#929AA5] border border-transparent hover:text-[#EAECEF]'
            }`}
          >
            {ORDER_TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      {/* Quantity */}
      <Input
        label="Quantidade"
        labelExtra={<InfoTip text="Numero inteiro de acoes que deseja negociar nesta ordem" />}
        type="number"
        min={1}
        step={1}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        error={errors.quantity}
        required
      />

      {/* Price (LIMIT, OCO) */}
      {(orderType === 'LIMIT' || orderType === 'OCO') && (
        <Input
          label="Preco (FS$)"
          labelExtra={<InfoTip text="Preco maximo (compra) ou minimo (venda) que voce aceita para esta ordem" />}
          type="number"
          min={0.01}
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={errors.price}
          required
        />
      )}

      {/* OCO extra fields */}
      {orderType === 'OCO' && (
        <>
          <Input
            label="Stop Loss (FS$)"
            labelExtra={<GlossaryInfoIcon fieldKey="stop-loss" size={12} />}
            type="number"
            min={0.01}
            step={0.01}
            value={stopLossPrice}
            onChange={(e) => setStopLossPrice(e.target.value)}
            error={errors.stopLossPrice}
            required
          />
          <Input
            label="Take Profit (FS$)"
            labelExtra={<GlossaryInfoIcon fieldKey="take-profit" size={12} />}
            type="number"
            min={0.01}
            step={0.01}
            value={takeProfitPrice}
            onChange={(e) => setTakeProfitPrice(e.target.value)}
            error={errors.takeProfitPrice}
            required
          />
        </>
      )}

      {/* SCHEDULED datetime */}
      {orderType === 'SCHEDULED' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="order-scheduled-at" className="text-sm text-[#EAECEF] font-medium">
            <Clock className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Data de execucao
          </label>
          <input
            id="order-scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            aria-required
            aria-invalid={!!errors.scheduledAt}
            aria-describedby={errors.scheduledAt ? 'order-scheduled-at-error' : undefined}
            className="h-11 w-full rounded-md border border-[rgba(240,185,11,.18)] bg-[rgba(240,185,11,.04)] text-[#EAECEF] text-sm px-3 focus:outline-none focus:border-[rgba(240,185,11,.5)] focus:ring-2 focus:ring-[rgba(240,185,11,.15)]"
            required
          />
          {errors.scheduledAt && (
            <p id="order-scheduled-at-error" role="alert" className="text-sm text-[#F6465D]">{errors.scheduledAt}</p>
          )}
        </div>
      )}

      {/* Alavancagem 2x — visivel apenas em ordens BUY */}
      {side === 'BUY' && (
        <LeverageToggle
          isLenda={isLenda}
          enabled={leverageEnabled}
          onToggle={setLeverageEnabled}
          operationValue={estimatedCost?.operationValue ?? 0}
          plan={plan}
        />
      )}

      {/* Estimated cost */}
      {estimatedCost && (
        <div className="bg-[#1E2329] rounded-lg p-3 space-y-1 text-sm">
          <div className="flex justify-between text-[#929AA5]">
            <span className="flex items-center gap-1">Valor da operacao <InfoTip text="Quantidade x preco unitario (sem taxas)" /></span>
            <span className="font-mono text-[#EAECEF]">FS$ {estimatedCost.operationValue.toFixed(2)}</span>
          </div>
          {estimatedCost.leverageEnabled && (
            <div className="flex justify-between text-[#929AA5]">
              <span className="flex items-center gap-1">
                Credito da plataforma (2x)
                <InfoTip text="A plataforma financia 50% do nocional. Sobre este valor incidem juros diarios de 0,2%." />
              </span>
              <span className="font-mono text-[#F0B90B]">FS$ {(estimatedCost.operationValue / 2).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-[#929AA5]">
            <span className="flex items-center gap-1">
              Taxa estimada
              <InfoTip text={
                side === 'SELL'
                  ? 'Taxa fixa cobrada sobre o valor da operacao. Deduzida dos rendimentos da venda.'
                  : 'Taxa fixa cobrada pela plataforma sobre o valor da operacao'
              } />
            </span>
            <span className="font-mono text-[#EAECEF]">FS$ {estimatedCost.fee.toFixed(2)}</span>
          </div>
          {side === 'SELL' && (
            <p className="text-[10px] text-[#707A8A] leading-relaxed">
              Taxa deduzida dos rendimentos. Voce recebera FS$ {(estimatedCost.operationValue - estimatedCost.fee).toFixed(2)}.
            </p>
          )}
          {side === 'BUY' && (
            <div className="flex justify-between text-[#EAECEF] font-medium border-t border-[#2B3139] pt-1">
              <span className="flex items-center gap-1">
                {estimatedCost.leverageEnabled ? 'Capital proprio necessario' : 'Total estimado'}
                <InfoTip text={estimatedCost.leverageEnabled
                  ? 'Seu capital proprio: 50% do nocional + taxa. O restante e credito virtual da plataforma.'
                  : 'Valor da operacao + taxa operacional'
                } />
              </span>
              <span className="font-mono">FS$ {estimatedCost.total.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {isOffline && (
        <div className="flex items-center gap-2 text-sm text-[#F6465D] bg-[rgba(246,70,93,.08)] p-2 rounded">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Motor offline — ordens desabilitadas.
        </div>
      )}
      {isMarketDisabled && (
        <div className="flex items-center gap-2 text-sm text-[#F0B90B] bg-[rgba(240,185,11,.08)] p-2 rounded">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Ordens a mercado so podem ser enviadas durante a sessao de negociacao.
        </div>
      )}
      {atDailyLimit && (
        <div
          role="alert"
          data-testid="daily-limit-banner"
          className="flex items-center gap-2 text-sm text-[#F6465D] bg-[rgba(246,70,93,.08)] border border-[rgba(246,70,93,.2)] p-3 rounded-lg"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Limite diario atingido. Retorne amanha.
        </div>
      )}

      {/* Submit */}
      <div
        title={isBalanceZero ? 'Saldo FS$ zerado. Venda posicoes para recuperar saldo e negociar novamente.' : undefined}
        className="w-full"
      >
        <Button
          type="submit"
          fullWidth
          isLoading={isSubmitting}
          disabled={isOffline || isMarketDisabled || atDailyLimit || isBalanceZero}
          className={isBuy
            ? 'bg-[#2EBD85] hover:bg-[#33d498] text-[#0B0E11] shadow-none'
            : 'bg-[#F6465D] hover:bg-[#ff5a70] text-white shadow-none'
          }
          data-testid="order-submit"
          aria-disabled={isBalanceZero}
        >
          {isBuy ? 'Confirmar Compra' : 'Confirmar Venda'}
        </Button>
      </div>
    </form>
  )
}
