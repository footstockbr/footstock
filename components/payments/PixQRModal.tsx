'use client'
// ============================================================================
// Foot Stock — PixQRModal: QR Code Pix com polling de status
// Aviso de não-recorrência: Pix não é cobrado automaticamente no mês seguinte
// Timer de 30 minutos com countdown visível
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import { SUBSCRIPTION_STATUS } from '@/lib/enums'
import { PIX_SUCCESS_DELAY_MS } from '@/lib/constants/timing'

interface PixQRModalProps {
  pixCode:        string        // código copia-e-cola
  qrCodeImageUrl: string        // URL da imagem QR code
  expiresAt:      string        // ISO timestamp — validade do QR (30min)
  subscriptionId: string
  amount:         number        // centavos
  planType:       string
  onSuccess:      () => void    // chamado quando pagamento confirmado
  onClose:        () => void
}

const POLLING_INTERVAL_MS = 5_000
const COPY_RESET_MS       = 2_000

function formatCentavos(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)
}

function formatCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const s = (secondsLeft % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function PixQRModal({
  pixCode,
  qrCodeImageUrl,
  expiresAt,
  subscriptionId,
  amount,
  planType,
  onSuccess,
  onClose,
}: PixQRModalProps) {
  const [copied,        setCopied]       = useState(false)
  const [secondsLeft,   setSecondsLeft]  = useState<number>(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
    return Math.max(0, diff)
  })
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'confirmed' | 'expired'>('pending')

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Polling de status ─────────────────────────────────────────────────────
  const checkPaymentStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/payments/status?subscriptionId=${subscriptionId}`)
      if (!res.ok) return
      const data = await res.json() as { status: string }

      if (data.status === SUBSCRIPTION_STATUS.ACTIVE) {
        setPaymentStatus('confirmed')
        if (pollingRef.current) clearInterval(pollingRef.current)
        if (timerRef.current)   clearInterval(timerRef.current)
        setTimeout(onSuccess, PIX_SUCCESS_DELAY_MS)
      }
    } catch {
      // silencioso — tentar na próxima iteração
    }
  }, [subscriptionId, onSuccess])

  // ── Countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (secondsLeft <= 0) {
      setPaymentStatus('expired')
      return
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current)   clearInterval(timerRef.current)
          if (pollingRef.current) clearInterval(pollingRef.current)
          setPaymentStatus('expired')
          return 0
        }
        return s - 1
      })
    }, 1000)

    pollingRef.current = setInterval(checkPaymentStatus, POLLING_INTERVAL_MS)

    return () => {
      if (timerRef.current)   clearInterval(timerRef.current)
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Copiar código ─────────────────────────────────────────────────────────
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pixCode)
      setCopied(true)
      setTimeout(() => setCopied(false), COPY_RESET_MS)
    } catch {
      // fallback para browsers sem clipboard API
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pix-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">

        {/* Fechar */}
        <button
          onClick={onClose}
          aria-label="Fechar modal"
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          ✕
        </button>

        {/* Título */}
        <h2 id="pix-modal-title" className="text-xl font-bold text-zinc-900 dark:text-white mb-1">
          Pagar com Pix
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          Plano {planType} — {formatCentavos(amount)}
        </p>

        {/* ── Aviso de não-recorrência (MUST) ────────────────────────────── */}
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded-lg p-3 mb-4 flex gap-2">
          <span className="text-amber-600 shrink-0" aria-hidden="true">⚠️</span>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <strong>Pix não é recorrente.</strong> Você precisará realizar o pagamento manualmente
            a cada renovação. O sistema não cobra automaticamente no mês seguinte.
          </p>
        </div>

        {/* ── Status ────────────────────────────────────────────────────── */}
        {paymentStatus === 'confirmed' && (
          <div
            role="status"
            aria-live="polite"
            className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center mb-4"
          >
            <p className="text-green-700 dark:text-green-300 font-semibold text-lg">✅ Pagamento confirmado!</p>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">Seu plano está sendo ativado...</p>
          </div>
        )}

        {paymentStatus === 'expired' && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-700 rounded-lg p-4 text-center mb-4"
          >
            <p className="text-red-700 dark:text-red-300 font-semibold">QR Code expirado</p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">Gere um novo QR para continuar.</p>
            <button
              onClick={onClose}
              className="mt-3 px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {paymentStatus === 'pending' && (
          <>
            {/* QR Code */}
            <div className="flex justify-center mb-4">
              <div className="relative w-48 h-48 border-2 border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                <Image
                  src={qrCodeImageUrl}
                  alt="QR Code Pix para pagamento"
                  fill
                  sizes="192px"
                  className="object-contain p-2"
                  priority
                />
              </div>
            </div>

            {/* Countdown */}
            <div
              aria-live="polite"
              aria-label={`QR code expira em ${formatCountdown(secondsLeft)}`}
              className={`text-center text-sm font-mono mb-4 ${
                secondsLeft < 60
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              ⏳ Expira em <strong>{formatCountdown(secondsLeft)}</strong>
            </div>

            {/* Copia e Cola */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Código Pix Copia e Cola
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={pixCode}
                  aria-label="Código Pix copia e cola"
                  className="flex-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 font-mono truncate"
                />
                <button
                  onClick={handleCopy}
                  aria-label={copied ? 'Código copiado' : 'Copiar código Pix'}
                  className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    copied
                      ? 'bg-green-600 text-white'
                      : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200'
                  }`}
                >
                  {copied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Instruções */}
            <ol className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1 list-decimal list-inside">
              <li>Abra o app do seu banco</li>
              <li>Acesse a área Pix e escolha <em>Pix Copia e Cola</em></li>
              <li>Cole o código acima e confirme o pagamento</li>
              <li>Esta janela atualizará automaticamente após a confirmação</li>
            </ol>
          </>
        )}
      </div>
    </div>
  )
}
