'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { mutate } from 'swr'

interface PlanRevalidateOnSuccessProps {
  /** true quando a URL e /planos?payment=success (retorno do gateway). */
  active: boolean
}

const POLL_INTERVAL_MS = 2_500
const MAX_ATTEMPTS     = 18    // 18 × 2.5s = 45 segundos
const JOGADOR          = 'JOGADOR'

/**
 * Ao retornar de um pagamento bem-sucedido, faz polling em /api/v1/subscriptions/me
 * até detectar status=ACTIVE (webhook processado) ou timeout de 45s.
 *
 * Problema anterior: fazia apenas um refresh imediato. Como o webhook do MercadoPago
 * é assíncrono, o usuário chegava na success URL antes do webhook disparar — o DB
 * ainda tinha planType='JOGADOR' e o plan card não atualizava.
 *
 * Fix: polling via /api/v1/subscriptions/me usando o sub= da URL como âncora.
 * Quando sub virar ACTIVE, invalida o cache SWR e força re-render do Server Component.
 */
export function PlanRevalidateOnSuccess({ active }: PlanRevalidateOnSuccessProps) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const handled      = useRef(false)
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active || handled.current) return
    handled.current = true

    const subId    = searchParams.get('sub')
    let attempts   = 0

    async function poll() {
      attempts++

      try {
        const res = await fetch('/api/v1/subscriptions/me', { credentials: 'include' })
        if (res.ok) {
          const json = await res.json() as { data?: { id?: string; status?: string; planType?: string } }
          const sub  = json.data
          // Verifica se é a assinatura correta (ou qualquer ACTIVE se sub não disponível)
          const isTarget  = !subId || sub?.id === subId
          const isActive  = sub?.status === 'ACTIVE'
          if (isTarget && isActive) {
            // Webhook processou — atualiza UI
            await mutate('plan-guard')
            router.refresh()
            return
          }
        }
      } catch {
        // falha silenciosa — tenta novamente
      }

      if (attempts < MAX_ATTEMPTS) {
        timerRef.current = setTimeout(() => { void poll() }, POLL_INTERVAL_MS)
      } else {
        // Timeout: faz um refresh final por segurança (plano pode ter atualizado)
        await mutate('plan-guard')
        router.refresh()
      }
    }

    // Primeira tentativa com delay curto — webhook rápido resolve sem esperar
    timerRef.current = setTimeout(() => { void poll() }, 1_000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Suprimir warning de unused — JOGADOR usado apenas como referência de tipo aqui
  void JOGADOR

  return null
}
