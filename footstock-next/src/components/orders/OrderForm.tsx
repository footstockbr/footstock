'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, Clock, WalletMinimal } from 'lucide-react'
import { InfoTip } from '@/components/ui/info-tip'
import { GlossaryInfoIcon } from '@/components/ui/glossary-info-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LeverageToggle } from '@/components/orders/LeverageToggle'
import { OrderConfirmationShortcuts } from '@/components/orders/OrderConfirmationShortcuts'
import { useMotorStatusContext } from '@/contexts/motor-status-context'
import { useMarketSession } from '@/hooks/useMarketSession'
import { useMarketTick } from '@/hooks/useMarketTick'
import { PriceHistoryChart } from '@/components/orders/PriceHistoryChart'
import { usePlanGuard, type PlanTier } from '@/hooks/usePlanGuard'
import { useBalance } from '@/hooks/useBalance'
import { useAnalytics } from '@/hooks/useAnalytics'
import { calculateFee } from '@/lib/constants/limits'
import { validateOcoPriceRelation, OCO_VIOLATION_MESSAGES } from '@/lib/validators/order'
import {
  LEVERAGE_DAILY_INTEREST_PERCENT_LABEL,
  LEVERAGE_REQUIRED_PLAN,
} from '@/lib/constants/leverage'
import { acceptsMarketOrders } from '@/lib/constants/market'
import type { OrderType } from '@/lib/analytics'
import type { SellPreviewDto } from '@/lib/contracts/sell-preview-contract'

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

const ORDER_ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE: 'Saldo FS$ insuficiente para criar a ordem.',
  ORDER_002: 'Saldo FS$ insuficiente para criar a ordem.',
  ORDER_050: 'Posição insuficiente para vender essa quantidade.',
  ORDER_051: 'Seu plano ou limite diário não permite esta ordem.',
  ORDER_057: 'Conflito ao criar ordem. Recarregue e tente novamente.',
  MOTOR_090: 'Motor de mercado temporariamente indisponível. Tente novamente em instantes.',
  SESS_040: 'Mercado fechado para ordens a mercado.',
  ASSET_030: 'Ativo temporariamente suspenso.',
  ASSET_031: 'Ativo não encontrado.',
  ASSET_033: 'Ativo desativado: não aceita novas ordens.',
  PAYMENT_054: 'Assinatura em cancelamento: novas ordens de risco estão bloqueadas.',
  'VAL-001': 'Dados inválidos. Verifique os campos e tente novamente.',
  'RATE-001': 'Muitas tentativas. Aguarde antes de enviar novas ordens.',
  STAFF_CANNOT_TRADE: 'Contas administrativas/institucionais não podem operar ordens.',
}

// Rotulos de status de ordem para o feedback de sucesso do envio (UX-005).
// OrderHistory.tsx mantem o proprio mapa para a listagem; a consolidacao dos dois
// acontece no contrato de historico de ordens.
const ORDER_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  PARTIAL: 'Parcial',
  FILLED: 'Executada',
  EXECUTED: 'Executada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
  SCHEDULED: 'Agendada',
}

// ── Preview de venda (inventario + preco) ────────────────────────────────────
// Recuperabilidade por codigo de erro (UX-006): oferecer "tentar novamente" em
// erro que retry nao resolve (403/404/422) so frustra o usuario. Cada codigo
// declara a acao que de fato o desbloqueia.
type SellPreviewRecovery = 'retry' | 'reauth' | 'none'

const SELL_PREVIEW_ERRORS: Record<string, { message: string; recovery: SellPreviewRecovery }> = {
  'AUTH-001': {
    message: 'Sessão expirada. Faça login novamente para carregar sua posição.',
    recovery: 'reauth',
  },
  STAFF_CANNOT_TRADE: {
    message: 'Contas administrativas/institucionais não podem operar ordens.',
    recovery: 'none',
  },
  ASSET_080: {
    message: 'Ativo não encontrado. Volte ao mercado e escolha outro ativo.',
    recovery: 'none',
  },
  ASSET_051: {
    message: 'Ativo inválido. Volte ao mercado e escolha outro ativo.',
    recovery: 'none',
  },
  PRICE_BUFFERING: {
    message: 'A cotação do seu plano ainda não está disponível. O sistema está aquecendo o buffer de preços.',
    recovery: 'retry',
  },
  'SYS-001': {
    message: 'Não foi possível carregar sua posição agora.',
    recovery: 'retry',
  },
}

const SELL_PREVIEW_FALLBACK_ERROR: { message: string; recovery: SellPreviewRecovery } = {
  message: 'Não foi possível carregar sua posição agora. Verifique a conexão e tente novamente.',
  recovery: 'retry',
}

// Horario de referencia da cotacao. O fuso canonico do Foot Stock e BRT; o
// timestamp chega em UTC e e convertido na exibicao.
function formatPriceTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function formatSignedFs(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}FS$ ${Math.abs(value).toFixed(2)}`
}

type SellPreviewState =
  | { status: 'loading' }
  | { status: 'error'; code: string; message: string; recovery: SellPreviewRecovery }
  | { status: 'success'; data: SellPreviewDto }

type OrderApiErrorBody = {
  error?: {
    code?: string
    message?: string
  } | string
  code?: string
  message?: string
}

function getOrderApiErrorCode(body: OrderApiErrorBody): string | undefined {
  const nestedError = typeof body.error === 'object' ? body.error : null
  return nestedError?.code ?? body.code ?? (typeof body.error === 'string' ? body.error : undefined)
}

function getOrderApiErrorMessage(body: OrderApiErrorBody, status: number): string {
  const nestedError = typeof body.error === 'object' ? body.error : null
  const code = getOrderApiErrorCode(body)
  const serverMessage = nestedError?.message ?? body.message

  if (code && ORDER_ERROR_MESSAGES[code]) return ORDER_ERROR_MESSAGES[code]
  if (serverMessage) return serverMessage
  return `Erro ${status} ao enviar ordem.`
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
  /**
   * Oculta o titulo interno quando o container ja nomeia o dialogo (UX-004: o
   * `Modal` com `title` renderiza `#modal-title` e o botao de fechar; repetir o
   * mesmo texto aqui duplicaria o cabecalho na tela).
   */
  showHeading?: boolean
}

export function OrderForm({ ticker, side, onSuccess, onClose, dailyOrdersUsed = 0, fsBalance: fsBalanceProp, showHeading = true }: OrderFormProps) {
  const queryClient = useQueryClient()
  const isSell = side === 'SELL'
  const { plan, hasAccess } = usePlanGuard()
  const { isOffline } = useMotorStatusContext()
  const { session } = useMarketSession()
  const { tick } = useMarketTick(ticker)
  const { fsBalance: fsBalanceFetched } = useBalance()
  const { track } = useAnalytics()
  // Usar prop se fornecida (evita fetch extra); caso contrário usar hook
  const fsBalance = fsBalanceProp !== undefined ? fsBalanceProp : (fsBalanceFetched ?? null)

  // OCO e venda protetiva de posicao LONG: o validador (`src/lib/validators/order.ts`)
  // rejeita OCO BUY, entao o tipo nem chega a ser oferecido no lado da compra.
  const allowedTypes = useMemo(
    () => ALLOWED_ORDER_TYPES[plan].filter((t) => !(t === 'OCO' && side === 'BUY')),
    [plan, side],
  )
  const dailyLimit = DAILY_ORDER_LIMITS[plan]
  const isLenda = hasAccess(LEVERAGE_REQUIRED_PLAN)

  const [orderType, setOrderType] = useState(allowedTypes[0])
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [stopLossPrice, setStopLossPrice] = useState('')
  const [takeProfitPrice, setTakeProfitPrice] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [leverageEnabled, setLeverageEnabled] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submitInFlightRef = useRef(false)
  // Inventario e preco do lado SELL vem exclusivamente do preview (criterio 1 da
  // fonte): o modal precisa mostrar posicao, reservas e P/L antes do envio.
  const [sellPreview, setSellPreview] = useState<SellPreviewState>({ status: 'loading' })

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

  const loadSellPreview = useCallback(async () => {
    setSellPreview({ status: 'loading' })
    try {
      const res = await fetch(`/api/v1/positions/${encodeURIComponent(ticker)}/sell-preview`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = getOrderApiErrorCode(body as OrderApiErrorBody) ?? 'SYS-001'
        const mapped = SELL_PREVIEW_ERRORS[code] ?? SELL_PREVIEW_FALLBACK_ERROR
        setSellPreview({ status: 'error', code, message: mapped.message, recovery: mapped.recovery })
        return
      }
      setSellPreview({ status: 'success', data: (body as { data: SellPreviewDto }).data })
    } catch {
      setSellPreview({
        status: 'error',
        code: 'NETWORK',
        message: SELL_PREVIEW_FALLBACK_ERROR.message,
        recovery: SELL_PREVIEW_FALLBACK_ERROR.recovery,
      })
    }
  }, [ticker])

  useEffect(() => {
    if (!isSell) return
    void loadSellPreview()
  }, [isSell, loadSellPreview])

  const preview = sellPreview.status === 'success' ? sellPreview.data : null

  // UX-001: no lado SELL nenhum valor monetario deriva do tick. O tick e um canal
  // de tempo real sem o atraso por plano; misturar as duas fontes faz o modal
  // mostrar um preco e a execucao usar outro.
  const tickPrice = tick?.lastPrice ?? 0
  const currentPrice = isSell ? (preview?.currentPrice ?? 0) : tickPrice
  const availableQty = preview?.availableQty ?? 0
  const quantityExceedsAvailable =
    isSell && preview !== null && Number(quantity) > preview.availableQty
  // Sem preview carregado o modal nao sabe quanto pode ser vendido; enviar assim
  // so produziria ORDER_050 do backend (Zero Assumido).
  const sellPreviewBlocking = isSell && (sellPreview.status !== 'success' || availableQty === 0)
  // MARKET orders aceitos em TRADING e CLOSING_CALL (call de fechamento também é
  // pregão aberto). A lista mora em constants/market e é a MESMA que o backend
  // usa no gate de criação — antes eram duas cópias que podiam divergir, e o
  // formulário liberava um envio que a API recusava com SESS_040.
  const isMarketClosed = !acceptsMarketOrders(session)
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

  // P/L estimado da venda: resultado bruto pelo preco medio menos a taxa estimada.
  // O extrato registra o resultado realizado BRUTO de taxas, entao os dois numeros
  // diferem exatamente pela taxa; o bloco explicita isso em tela (Zero Assumido).
  const estimatedPnl = useMemo(() => {
    if (!isSell || !preview || preview.avgPrice === null || !estimatedCost) return null
    const qty = Number(quantity)
    if (!qty || qty <= 0) return null
    const referencePrice = orderType === 'MARKET' ? currentPrice : Number(price)
    if (!referencePrice || referencePrice <= 0) return null
    const gross = (referencePrice - preview.avgPrice) * qty
    const fee = estimatedCost.fee
    return { referencePrice, gross, fee, net: gross - fee }
  }, [isSell, preview, estimatedCost, quantity, orderType, currentPrice, price])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    const qty = Number(quantity)

    if (!qty || qty < 1 || !Number.isInteger(qty)) {
      errs.quantity = 'Quantidade deve ser um número inteiro de no mínimo 1 cota.'
    } else if (isSell && preview && qty > preview.availableQty) {
      errs.quantity = `Você tem ${preview.availableQty} cota(s) disponível(is) para venda.`
    }

    // Guarda de submit programatico: sem preview carregado o POST nao sai daqui.
    if (isSell && sellPreview.status !== 'success') {
      errs.quantity = 'Aguarde o carregamento da sua posição antes de enviar a ordem.'
    }

    if (orderType === 'LIMIT') {
      if (!Number(price) || Number(price) <= 0) {
        errs.price = 'Preço limite obrigatório.'
      }
    }

    if (orderType === 'OCO') {
      // Fonte unica da relacao de precos, compartilhada com o validador Zod do backend.
      const oco = validateOcoPriceRelation({
        side,
        price: Number(price),
        stopLossPrice: Number(stopLossPrice),
        takeProfitPrice: Number(takeProfitPrice),
      })

      if (!oco.valid) {
        if (oco.code === 'SIDE_NOT_SELL') {
          errs.side = OCO_VIOLATION_MESSAGES.SIDE_NOT_SELL
        } else if (oco.code === 'MISSING_PRICES') {
          // Detalha campo a campo para o usuario saber qual preco falta.
          if (!Number(price) || Number(price) <= 0) errs.price = 'Preço obrigatório.'
          if (!Number(stopLossPrice) || Number(stopLossPrice) <= 0) errs.stopLossPrice = 'Stop Loss obrigatório.'
          if (!Number(takeProfitPrice) || Number(takeProfitPrice) <= 0) errs.takeProfitPrice = 'Take Profit obrigatório.'
        } else {
          errs.stopLossPrice = oco.message ?? OCO_VIOLATION_MESSAGES.INVALID_RELATION
        }
      }
    }

    if (orderType === 'SCHEDULED') {
      if (!scheduledAt) {
        errs.scheduledAt = 'Data de agendamento obrigatória.'
      } else if (new Date(scheduledAt) <= new Date()) {
        errs.scheduledAt = 'Data deve ser no futuro.'
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitInFlightRef.current) return
    if (!validate()) return

    submitInFlightRef.current = true
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
        const data = (await res.json().catch(() => ({}))) as OrderApiErrorBody
        // ORDER_050 significa que a posicao mudou entre a abertura do modal e o
        // envio (execucao de OCO, outra aba). Recarregar o preview antes de
        // relancar deixa os numeros da tela corretos sem fechar o modal.
        if (getOrderApiErrorCode(data) === 'ORDER_050' && isSell) {
          await loadSellPreview()
        }
        throw new Error(getOrderApiErrorMessage(data, res.status))
      }

      const payload = (await res.json().catch(() => ({}))) as {
        data?: { order?: { status?: string } }
      }
      const orderStatus = payload.data?.order?.status
      const statusLabel = orderStatus ? (ORDER_STATUS_LABELS[orderStatus] ?? orderStatus) : null

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

      // T-05: invalidar caches relacionados a ordens e portfólio
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      await queryClient.invalidateQueries({ queryKey: ['portfolio-history'] })

      // UX-005: o usuario precisa saber em que estado a ordem ficou e ter um
      // caminho para acompanha-la, em vez de so um "enviada!" sem continuacao.
      const successMessage = side === 'BUY'
        ? `Ordem de compra de ${ticker} enviada!`
        : `Ordem de venda de ${ticker} enviada!`
      toast.success(
        statusLabel ? `${successMessage} Status: ${statusLabel}.` : successMessage,
        {
          action: {
            label: 'Ver ordem',
            // Navegacao por location e nao por useRouter: o OrderForm e montado
            // isolado (fora de um app-router context) e o hook lancaria invariant.
            onClick: () => { window.location.assign('/ordens') },
          },
        },
      )
      onSuccess?.()
      onClose?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar ordem.')
    } finally {
      submitInFlightRef.current = false
      setIsSubmitting(false)
    }
  }

  const isBuy = side === 'BUY'

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="order-form" data-tour="order-form">
      {/* Header */}
      <div className="flex flex-col gap-1 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
        {showHeading && (
          <h2 className="text-[#EAECEF] font-semibold text-lg">
            {isBuy ? 'Comprar' : 'Vender'}{' '}
            <span className={isBuy ? 'text-[#2EBD85]' : 'text-[#F6465D]'}>{ticker}</span>
          </h2>
        )}
        {currentPrice > 0 && (
          <span className="text-sm text-[#929AA5]">
            Preço atual: <span className="text-[#EAECEF] font-mono">FS$ {currentPrice.toFixed(2)}</span>
          </span>
        )}
      </div>

      {/* 7-day price history chart — N-04 */}
      {isBuy && currentPrice > 0 && (
        <div className="bg-[#1E2329] rounded-lg p-3 border border-[rgba(240,185,11,.1)]">
          <PriceHistoryChart ticker={ticker} currentPrice={currentPrice} />
        </div>
      )}


      {/* Daily limit counter + saldo atual */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[#707A8A]">
        <span>
          {dailyLimit === Infinity
            ? 'Ordens ilimitadas hoje'
            : ordersRemaining > 0
              ? `${ordersRemaining} ordem${ordersRemaining !== 1 ? 's' : ''} restante${ordersRemaining !== 1 ? 's' : ''} hoje`
              : 'Limite diário atingido'}
        </span>
        {fsBalance !== null && (
          <span className={`flex items-center gap-1 font-mono ${fsBalance <= 0 ? 'text-[#F6465D] font-semibold' : 'text-[#929AA5]'}`}>
            <WalletMinimal className="h-3 w-3" aria-hidden="true" />
            FS$ {fsBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* Inventario de venda: posicao, reservas e preco de referencia (criterio 1
          da fonte). Renderizado apenas no lado SELL. */}
      {isSell && (
        <div
          data-testid="order-sell-inventory"
          className="space-y-2 rounded-lg border border-border bg-card p-3"
        >
          {sellPreview.status === 'loading' && (
            <div data-testid="order-sell-inventory-loading" role="status" aria-live="polite" className="space-y-2">
              <span className="sr-only">Carregando sua posição em {ticker}.</span>
              <div className="h-3 w-2/3 rounded bg-elevated animate-pulse" aria-hidden="true" />
              <div className="h-3 w-1/2 rounded bg-elevated animate-pulse" aria-hidden="true" />
              <div className="h-3 w-3/5 rounded bg-elevated animate-pulse" aria-hidden="true" />
            </div>
          )}

          {sellPreview.status === 'error' && (
            <div data-testid="order-sell-inventory-error" role="alert" className="space-y-2">
              <p className="flex items-start gap-2 text-md text-primary">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-error" aria-hidden="true" />
                <span>{sellPreview.message}</span>
              </p>
              {sellPreview.recovery === 'retry' && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="order-sell-inventory-retry"
                  onClick={() => { void loadSellPreview() }}
                >
                  Tentar novamente
                </Button>
              )}
              {sellPreview.recovery === 'reauth' && (
                <a
                  href="/login"
                  data-testid="order-sell-inventory-reauth"
                  className="inline-block min-h-[44px] text-md font-medium text-primary underline"
                >
                  Fazer login novamente
                </a>
              )}
            </div>
          )}

          {preview && (
            <>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-md">
                <dt className="text-primary">Cotas possuídas</dt>
                <dd data-testid="order-sell-owned-qty" className="text-right font-mono text-primary">{preview.ownedQty}</dd>
                <dt className="text-primary">Reservadas em ordens abertas</dt>
                <dd data-testid="order-sell-reserved-qty" className="text-right font-mono text-primary">{preview.reservedQty}</dd>
                <dt className="text-primary">Disponíveis para venda</dt>
                <dd data-testid="order-sell-available-qty" className="text-right font-mono text-primary">{preview.availableQty}</dd>
                <dt className="text-primary">Preço médio de compra</dt>
                <dd data-testid="order-sell-avg-price" className="text-right font-mono text-primary">
                  {preview.avgPrice !== null ? `FS$ ${preview.avgPrice.toFixed(2)}` : 'sem posição'}
                </dd>
                <dt className="text-primary">Preço corrente</dt>
                <dd data-testid="order-sell-current-price" className="text-right font-mono text-primary">
                  FS$ {preview.currentPrice.toFixed(2)}
                </dd>
              </dl>

              <p data-testid="order-sell-price-as-of" className="flex items-start gap-1 text-base leading-relaxed text-primary">
                <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>
                  Cotação de {formatPriceTime(preview.currentPriceAsOf)}
                  {preview.isPriceDelayed
                    ? `. Seu plano tem atraso de ${preview.priceDelayMinutes} min, então o P/L estimado não usa o preço de agora.`
                    : '. Cotação em tempo real.'}
                </span>
              </p>

              {!preview.hasPosition && (
                <p data-testid="order-sell-inventory-empty" className="text-md text-primary">
                  Você ainda não tem cotas de {ticker}. Compre cotas antes de vender.
                </p>
              )}

              {preview.availableQty === 0 && (
                <div
                  role="alert"
                  data-testid="order-sell-unavailable"
                  className="flex items-start gap-2 rounded-lg border border-error bg-card p-2 text-md text-primary"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-error" aria-hidden="true" />
                  <span>
                    {preview.hasPosition ? (
                      <>
                        Venda indisponível: suas {preview.ownedQty} cota(s) já estão reservadas em ordens de venda abertas.
                        Cancele uma delas para liberar cotas.{' '}
                        <a href="/ordens" className="font-medium underline">Ver minhas ordens</a>
                      </>
                    ) : (
                      <>Venda indisponível: você não tem cotas de {ticker} para vender.</>
                    )}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* T-019: banner saldo zerado — visivel apenas em BUY */}
      {isBalanceZero && (
        <div
          role="alert"
          data-testid="balance-zero-banner"
          className="flex items-center gap-2 text-sm text-[#F6465D] bg-[rgba(246,70,93,.08)] border border-[rgba(246,70,93,.2)] p-3 rounded-lg"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>Saldo zerado — venda posições para negociar novamente.</span>
        </div>
      )}

      {/* Order type selector */}
      <div role="group" aria-label="Tipo de ordem" className="flex flex-wrap gap-2" data-tour="order-type-selector">
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

      {errors.side && (
        <p role="alert" data-testid="order-oco-side-error" className="text-sm text-[#F6465D]">
          {errors.side}
        </p>
      )}

      {/* Quantity — cota livre com atalhos -100 / -10 / +10 / +100 */}
      <div className="flex flex-col gap-1">
        <label htmlFor="order-quantity" className="text-sm text-[#EAECEF] font-medium flex items-center gap-1">
          Quantidade (cotas)
          <InfoTip text="Informe a quantidade de cotas. Mínimo: 1. Use os atalhos para ajustar rapidamente." />
        </label>
        <div
          role="group"
          aria-label="Ajustar quantidade"
          className="grid grid-cols-4 gap-2 min-[380px]:grid-cols-[2.75rem_2.75rem_minmax(72px,1fr)_2.75rem_2.75rem]"
        >
          <button
            type="button"
            data-testid="order-quantity-minus"
            disabled={Number(quantity) <= 1}
            onClick={() => setQuantity(String(Math.max(1, Number(quantity) - 100)))}
            className="h-11 flex items-center justify-center rounded-md border border-[rgba(240,185,11,.18)] bg-[rgba(240,185,11,.04)] text-[#EAECEF] text-sm font-bold hover:bg-[rgba(240,185,11,.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-[380px]:col-start-1 min-[380px]:row-start-1"
            aria-label="Diminuir 100 cotas"
          >
            -100
          </button>
          <button
            type="button"
            data-testid="order-quantity-step-10-down"
            disabled={Number(quantity) <= 1}
            onClick={() => setQuantity(String(Math.max(1, Number(quantity) - 10)))}
            className="h-11 flex items-center justify-center rounded-md border border-[rgba(240,185,11,.18)] bg-[rgba(240,185,11,.04)] text-[#EAECEF] text-sm font-bold hover:bg-[rgba(240,185,11,.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-[380px]:col-start-2 min-[380px]:row-start-1"
            aria-label="Diminuir 10 cotas"
          >
            -10
          </button>
          <input
            id="order-quantity"
            data-testid="order-quantity-input"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={() => {
              const val = Number(quantity)
              if (!val || val < 1) setQuantity('1')
              else if (!Number.isInteger(val)) setQuantity(String(Math.max(1, Math.floor(val))))
            }}
            className="h-11 col-span-4 min-w-0 rounded-md border border-[rgba(240,185,11,.18)] bg-[rgba(240,185,11,.04)] text-[#EAECEF] text-sm text-center font-mono px-2 focus:outline-none focus:border-[rgba(240,185,11,.5)] focus:ring-2 focus:ring-[rgba(240,185,11,.15)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-[380px]:col-span-1 min-[380px]:col-start-3 min-[380px]:row-start-1"
            required
            aria-invalid={!!errors.quantity}
            aria-describedby={errors.quantity ? 'order-quantity-error' : undefined}
          />
          <button
            type="button"
            data-testid="order-quantity-step-10-up"
            onClick={() => setQuantity(String(Math.max(1, Number(quantity)) + 10))}
            className="h-11 flex items-center justify-center rounded-md border border-[rgba(240,185,11,.18)] bg-[rgba(240,185,11,.04)] text-[#EAECEF] text-sm font-bold hover:bg-[rgba(240,185,11,.1)] transition-colors min-[380px]:col-start-4 min-[380px]:row-start-1"
            aria-label="Aumentar 10 cotas"
          >
            +10
          </button>
          <button
            type="button"
            data-testid="order-quantity-plus"
            onClick={() => setQuantity(String(Math.max(1, Number(quantity)) + 100))}
            className="h-11 flex items-center justify-center rounded-md border border-[rgba(240,185,11,.18)] bg-[rgba(240,185,11,.04)] text-[#EAECEF] text-sm font-bold hover:bg-[rgba(240,185,11,.1)] transition-colors min-[380px]:col-start-5 min-[380px]:row-start-1"
            aria-label="Aumentar 100 cotas"
          >
            +100
          </button>
        </div>
        {isSell && preview && (
          <div className="flex items-center justify-between gap-2 text-md">
            <span className="text-primary">Disponível: {preview.availableQty} cota(s)</span>
            <button
              type="button"
              data-testid="order-sell-max"
              disabled={preview.availableQty === 0}
              onClick={() => setQuantity(String(preview.availableQty))}
              className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-card px-3 font-semibold text-primary transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Máx.
            </button>
          </div>
        )}
        {quantityExceedsAvailable && (
          <p role="alert" data-testid="order-sell-exceeds" className="text-md text-primary">
            Você tem {availableQty} cota(s) disponível(is) para venda.
          </p>
        )}
        {errors.quantity && (
          <p id="order-quantity-error" role="alert" className="text-sm text-[#F6465D]">{errors.quantity}</p>
        )}
      </div>

      {/* Price (LIMIT, OCO) */}
      {(orderType === 'LIMIT' || orderType === 'OCO') && (
        <Input
          label="Preço (FS$)"
          labelExtra={<InfoTip text="Preço máximo (compra) ou mínimo (venda) que você aceita para esta ordem" />}
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
            Data de execução
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
        <div className="space-y-1 rounded-lg border border-border bg-card p-3 text-md">
          <div className="flex items-start justify-between gap-3 text-primary">
            <span className="flex min-w-0 items-center gap-1">Valor da operação <InfoTip text="Quantidade x preço unitário (sem taxas)" /></span>
            <span className="shrink-0 text-right font-mono text-primary">FS$ {estimatedCost.operationValue.toFixed(2)}</span>
          </div>
          {estimatedCost.leverageEnabled && (
            <div className="flex items-start justify-between gap-3 text-primary">
              <span className="flex min-w-0 items-center gap-1">
                Crédito da plataforma (2x)
                <InfoTip text={`A plataforma financia 50% do nocional. Sobre este valor incidem juros diários de ${LEVERAGE_DAILY_INTEREST_PERCENT_LABEL}.`} />
              </span>
              <span className="shrink-0 text-right font-mono text-primary">FS$ {(estimatedCost.operationValue / 2).toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-3 text-primary">
            <span className="flex min-w-0 items-center gap-1">
              Taxa estimada
              <InfoTip text={
                side === 'SELL'
                  ? 'Taxa fixa cobrada sobre o valor da operação. Deduzida dos rendimentos da venda.'
                  : 'Taxa fixa cobrada pela plataforma sobre o valor da operação'
              } />
            </span>
            <span className="shrink-0 text-right font-mono text-primary">FS$ {estimatedCost.fee.toFixed(2)}</span>
          </div>
          {side === 'SELL' && (
            <p className="text-base leading-relaxed text-primary">
              Taxa deduzida dos rendimentos. Você receberá FS$ {(estimatedCost.operationValue - estimatedCost.fee).toFixed(2)}.
            </p>
          )}
          {side === 'BUY' && (
            <div className="flex items-start justify-between gap-3 border-t border-border pt-1 font-medium text-primary">
              <span className="flex min-w-0 items-center gap-1">
                {estimatedCost.leverageEnabled ? 'Capital próprio necessário' : 'Total estimado'}
                <InfoTip text={estimatedCost.leverageEnabled
                  ? 'Seu capital próprio: 50% do nocional + taxa. O restante é crédito virtual da plataforma.'
                  : 'Valor da operação + taxa operacional'
                } />
              </span>
              <span className="shrink-0 text-right font-mono">FS$ {estimatedCost.total.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* P/L estimado da venda, decomposto para reconciliar com o extrato (UX-002) */}
      {estimatedPnl && (
        <div data-testid="order-sell-estimated-pnl" className="space-y-1 rounded-lg border border-border bg-card p-3 text-md">
          <p className="flex min-w-0 items-center gap-1 font-medium text-primary">
            P/L estimado
            <InfoTip text="Estimativa pelo preço médio de compra da sua posição. Não considera a taxa paga na compra." />
          </p>
          <div className="flex items-start justify-between gap-3 text-primary">
            <span className="min-w-0">Resultado bruto</span>
            <span
              data-testid="order-sell-pnl-gross"
              className={`shrink-0 text-right font-mono ${estimatedPnl.gross >= 0 ? 'text-success' : 'text-error'}`}
            >
              {formatSignedFs(estimatedPnl.gross)}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3 text-primary">
            <span className="min-w-0">Taxa estimada da venda</span>
            <span data-testid="order-sell-pnl-fee" className="shrink-0 text-right font-mono text-primary">
              FS$ {estimatedPnl.fee.toFixed(2)}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3 border-t border-border pt-1 font-medium text-primary">
            <span className="min-w-0">Resultado após a taxa</span>
            <span
              data-testid="order-sell-pnl-net"
              className={`shrink-0 text-right font-mono ${estimatedPnl.net >= 0 ? 'text-success' : 'text-error'}`}
            >
              {formatSignedFs(estimatedPnl.net)}
            </span>
          </div>
          <p className="text-base leading-relaxed text-primary">
            Estimativa pelo preço médio de compra, sem a taxa histórica da compra. O resultado realizado
            que aparece no extrato é bruto de taxas, então ele fica FS$ {estimatedPnl.fee.toFixed(2)} acima
            do resultado após a taxa mostrado aqui.
          </p>
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
          Ordens a mercado só podem ser enviadas durante a sessão de negociação.
        </div>
      )}
      {atDailyLimit && (
        <div
          role="alert"
          data-testid="daily-limit-banner"
          className="flex items-center gap-2 text-sm text-[#F6465D] bg-[rgba(246,70,93,.08)] border border-[rgba(246,70,93,.2)] p-3 rounded-lg"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Limite diário atingido. Retorne amanhã.
        </div>
      )}

      {/* Submit */}
      <div
        title={isBalanceZero ? 'Saldo FS$ zerado. Venda posições para recuperar saldo e negociar novamente.' : undefined}
        className="w-full"
      >
        <Button
          type="submit"
          fullWidth
          isLoading={isSubmitting}
          disabled={isOffline || isMarketDisabled || atDailyLimit || isBalanceZero || sellPreviewBlocking || quantityExceedsAvailable}
          className={isBuy
            ? 'bg-[#2EBD85] hover:bg-[#33d498] text-[#0B0E11] shadow-none'
            : 'bg-[#F6465D] hover:bg-[#ff5a70] text-white shadow-none'
          }
          data-testid="order-submit"
          aria-disabled={isBalanceZero || sellPreviewBlocking || quantityExceedsAvailable}
        >
          {isBuy ? 'Confirmar Compra' : 'Confirmar Venda'}
        </Button>
      </div>

      {/* Item 1/27: Premium features showcase — descoberta de ferramentas avançadas */}
      <OrderConfirmationShortcuts operationType={side} />
    </form>
  )
}
