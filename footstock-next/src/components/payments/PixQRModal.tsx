'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AlertTriangle, Copy, Check, X, QrCode, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBRLFromCents } from '@/lib/constants/plan-amounts-cents'

type PlanType = 'CRAQUE' | 'LENDA'
type Period = 'monthly' | 'yearly'

interface PixQRModalProps {
  planType: PlanType
  period?: Period
  onClose: () => void
}

interface PixData {
  subscriptionId: string
  pixCode: string
  qrCodeImageUrl: string
  expiresAt: string
  // SSoT (FIX-12): valor cobrado em centavos, vindo do backend.
  amountCents: number
  nonRecurrenceWarning: string
}

const PLAN_LABELS: Record<PlanType, string> = {
  CRAQUE: 'Craque',
  LENDA: 'Lenda',
}

const EXPIRY_SECONDS = 30 * 60 // 30 minutes

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(EXPIRY_SECONDS)

  useEffect(() => {
    if (!expiresAt) return
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSecondsLeft(diff)
      if (diff === 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const seconds = (secondsLeft % 60).toString().padStart(2, '0')
  return { display: `${minutes}:${seconds}`, expired: secondsLeft === 0 }
}

export function PixQRModal({ planType, period = 'monthly', onClose }: PixQRModalProps) {
  const [pixData, setPixData] = useState<PixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const { display: countdown, expired } = useCountdown(pixData?.expiresAt ?? null)

  // SSoT (FIX-12): preco exibido deriva exclusivamente do valor cobrado (amountCents).
  // Enquanto carrega ou em erro, NAO inventa preco e NUNCA mostra "R$ 0,00" mascarando ausencia.
  const priceLabel =
    typeof pixData?.amountCents === 'number' && pixData.amountCents > 0
      ? formatBRLFromCents(pixData.amountCents)
      : null

  const fetchPixQR = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/payments/pix-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType, period }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.message ?? 'Erro ao gerar QR Code Pix. Tente novamente.')
        return
      }
      setPixData(json as PixData)
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [planType, period])

  useEffect(() => {
    fetchPixQR()
  }, [fetchPixQR])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleCopy = useCallback(async () => {
    if (!pixData?.pixCode) return
    try {
      await navigator.clipboard.writeText(pixData.pixCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // fallback for Safari/non-secure contexts
      const el = document.createElement('textarea')
      el.value = pixData.pixCode
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }, [pixData?.pixCode])

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      data-testid="pix-qr-modal"
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
      }}
    >
      <div
        data-testid="pix-qr-modal-content"
        style={{
          background: '#1E2329',
          border: '1px solid rgba(240,185,11,.25)',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '380px',
          position: 'relative',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pix-modal-title"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#929AA5',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ background: 'rgba(240,185,11,.15)', borderRadius: '8px', padding: '8px', display: 'flex' }}>
            <QrCode size={20} color="#F0B90B" />
          </div>
          <div>
            <h2 id="pix-modal-title" style={{ color: '#EAECEF', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Pagar com Pix
            </h2>
            <p style={{ color: '#929AA5', fontSize: '12px', margin: 0 }} data-testid="pix-plan-price">
              Plano {PLAN_LABELS[planType]}
              {priceLabel
                ? ` — ${priceLabel}`
                : loading
                  ? ' — calculando valor...'
                  : ''}
            </p>
          </div>
        </div>

        {/* Non-recurrence warning */}
        <div
          data-testid="pix-nonrecurrence-warning"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            background: 'rgba(255,193,7,.08)',
            border: '1px solid rgba(255,193,7,.25)',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '16px',
          }}
        >
          <AlertTriangle size={14} color="#F0B90B" style={{ flexShrink: 0, marginTop: '1px' }} />
          <p style={{ color: '#c5b99a', fontSize: '12px', margin: 0, lineHeight: '1.4' }}>
            {pixData?.nonRecurrenceWarning ??
              'Pix não é cobrado automaticamente. Renove manualmente a cada ciclo.'}
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div
            data-testid="pix-loading"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              padding: '32px 0',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(240,185,11,.2)',
                borderTopColor: '#F0B90B',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p style={{ color: '#929AA5', fontSize: '13px', margin: 0 }}>Gerando QR Code Pix...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div
            data-testid="pix-error"
            style={{ textAlign: 'center', padding: '24px 0' }}
          >
            <p style={{ color: '#F6465D', fontSize: '13px', marginBottom: '16px' }} role="alert">
              {error}
            </p>
            <Button variant="secondary" size="sm" onClick={fetchPixQR}>
              Tentar novamente
            </Button>
          </div>
        )}

        {/* QR Code display */}
        {!loading && pixData && !error && (
          <div data-testid="pix-qr-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            {/* Expired banner */}
            {expired && (
              <div
                data-testid="pix-expired-banner"
                style={{
                  background: 'rgba(246,70,93,.1)',
                  border: '1px solid rgba(246,70,93,.3)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  textAlign: 'center',
                  width: '100%',
                }}
              >
                <p style={{ color: '#F6465D', fontSize: '13px', margin: '0 0 8px' }}>
                  QR Code expirado.
                </p>
                <Button variant="secondary" size="sm" onClick={fetchPixQR}>
                  Gerar novo QR Code
                </Button>
              </div>
            )}

            {/* QR image */}
            {!expired && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pixData.qrCodeImageUrl}
                alt="QR Code Pix para pagamento"
                data-testid="pix-qr-image"
                style={{
                  width: '200px',
                  height: '200px',
                  borderRadius: '12px',
                  border: '2px solid rgba(240,185,11,.2)',
                  background: '#fff',
                  padding: '8px',
                }}
              />
            )}

            {/* Countdown */}
            {!expired && (
              <div
                data-testid="pix-countdown"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Clock size={14} color="#929AA5" />
                <span style={{ color: '#929AA5', fontSize: '12px' }}>
                  Expira em{' '}
                  <span style={{ color: '#F0B90B', fontFamily: 'monospace', fontWeight: 600 }}>
                    {countdown}
                  </span>
                </span>
              </div>
            )}

            {/* Copy code */}
            {!expired && (
              <div style={{ width: '100%' }}>
                <p style={{ color: '#929AA5', fontSize: '11px', marginBottom: '6px', textAlign: 'center' }}>
                  Ou copie o código Pix copia e cola:
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#151A21',
                    border: '1px solid rgba(240,185,11,.15)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                  }}
                >
                  <span
                    data-testid="pix-code-text"
                    style={{
                      flex: 1,
                      color: '#EAECEF',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      lineHeight: '1.4',
                      maxHeight: '60px',
                      overflow: 'hidden',
                    }}
                  >
                    {pixData.pixCode}
                  </span>
                  <button
                    type="button"
                    data-testid="pix-copy-button"
                    onClick={handleCopy}
                    aria-label={copied ? 'Copiado' : 'Copiar código Pix'}
                    style={{
                      flexShrink: 0,
                      background: copied ? 'rgba(46,189,133,.15)' : 'rgba(240,185,11,.1)',
                      border: `1px solid ${copied ? 'rgba(46,189,133,.3)' : 'rgba(240,185,11,.2)'}`,
                      borderRadius: '6px',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: copied ? '#2EBD85' : '#F0B90B',
                      fontSize: '11px',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                    }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {/* Instructions */}
            {!expired && (
              <ol
                style={{
                  color: '#929AA5',
                  fontSize: '11px',
                  margin: 0,
                  paddingLeft: '16px',
                  lineHeight: '1.6',
                  alignSelf: 'flex-start',
                }}
              >
                <li>Abra o app do seu banco</li>
                <li>Escolha pagar com Pix — leia QR ou cole o código</li>
                <li>Confirme o pagamento e aguarde a ativação (até 5 min)</li>
              </ol>
            )}
          </div>
        )}

        {/* Close button bottom */}
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '20px',
            width: '100%',
            padding: '10px',
            background: 'transparent',
            border: '1px solid rgba(240,185,11,.15)',
            borderRadius: '8px',
            color: '#929AA5',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  )
}
