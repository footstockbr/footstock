'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'

interface PlanRevalidateOnSuccessProps {
  /** true quando a URL e /planos?payment=success (retorno do gateway). */
  active: boolean
}

/**
 * task-005 (P2 frontend): ao retornar de um pagamento bem-sucedido, refaz o fetch
 * imediato do plano para que os cards de /planos nao fiquem stale por ate 60s.
 * - mutate('plan-guard'): invalida o cache SWR consumido por CheckoutButton/PlanCTAButton.
 * - router.refresh(): re-renderiza o Server Component da pagina com o planType atualizado.
 */
export function PlanRevalidateOnSuccess({ active }: PlanRevalidateOnSuccessProps) {
  const router = useRouter()
  const handled = useRef(false)

  useEffect(() => {
    if (!active || handled.current) return
    handled.current = true
    void mutate('plan-guard')
    router.refresh()
  }, [active, router])

  return null
}
