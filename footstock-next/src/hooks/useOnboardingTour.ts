'use client'

/**
 * T-013 — Hook principal do onboarding tour adaptativo.
 *
 * Responsabilidades:
 * - Buscar dados do usuário (tourCompleted, investorProfile)
 * - Gerenciar estado do tour (passo atual, ativo, ref do elemento alvo)
 * - Avançar, retroceder, pular e concluir o tour
 * - Chamar os endpoints dedicados
 * - Emitir eventos de analytics
 * - Aguardar elemento no DOM (timeout 3s) antes de cada passo
 * - Scroll suave até o elemento alvo
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getTourSteps, type TourStepDef } from '@/constants/tourSteps'
import { useAnalytics } from '@/hooks/useAnalytics'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface TourState {
  isActive: boolean
  isLoading: boolean
  currentStep: number
  steps: TourStepDef[]
  targetRect: DOMRect | null
  investorProfile: string | null
}

export interface UseTourReturn extends TourState {
  advance: () => void
  back: () => void
  skip: () => void
  complete: () => void
}

// ── Constantes ─────────────────────────────────────────────────────────────────

const ELEMENT_WAIT_TIMEOUT_MS = 3000
const ELEMENT_POLL_INTERVAL_MS = 100
const API_BASE = '/api/v1/users/me'
const USER_ME_URL = '/api/v1/me'

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useOnboardingTour(): UseTourReturn {
  const [isActive, setIsActive] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [steps, setSteps] = useState<TourStepDef[]>([])
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [investorProfile, setInvestorProfile] = useState<string | null>(null)
  const [userPlan, setUserPlan] = useState<string>('JOGADOR')

  const { track } = useAnalytics()
  const isMutating = useRef(false)

  // ── 1. Carregar dados do usuário ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function loadUser() {
      try {
        const res = await fetch(USER_ME_URL, { cache: 'no-store' })
        if (!res.ok) {
          setIsLoading(false)
          return
        }
        const json = await res.json()
        const user = json.data ?? json

        if (cancelled) return

        // Se investorProfile não definido, não pode iniciar tour
        if (!user.investorProfile) {
          setIsLoading(false)
          return
        }

        // Se tour já concluído, não exibe
        if (user.tourCompleted) {
          setIsLoading(false)
          return
        }

        const tourSteps = getTourSteps(user.investorProfile)
        setInvestorProfile(user.investorProfile)
        setUserPlan(user.plan ?? 'JOGADOR')
        setSteps(tourSteps)
        setIsActive(true)
        setIsLoading(false)
      } catch {
        setIsLoading(false)
      }
    }

    loadUser()
    return () => { cancelled = true }
  }, [])

  // ── 2. Resolver elemento alvo ao mudar de passo ───────────────────────────

  useEffect(() => {
    if (!isActive || steps.length === 0) return

    const step = steps[currentStep]
    if (!step?.targetId) {
      setTargetRect(null)
      return
    }

    let elapsed = 0
    let timer: ReturnType<typeof setInterval> | null = null

    function tryFindElement() {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step!.targetId}"]`)
      if (el) {
        // Scroll suave até o elemento se não estiver visível
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        // Pequeno delay para o scroll terminar antes de medir
        setTimeout(() => {
          setTargetRect(el.getBoundingClientRect())
        }, 200)
        if (timer) clearInterval(timer)
        return
      }

      elapsed += ELEMENT_POLL_INTERVAL_MS
      if (elapsed >= ELEMENT_WAIT_TIMEOUT_MS) {
        // Elemento não encontrado no tempo limite — avança sem spotlight
        setTargetRect(null)
        if (timer) clearInterval(timer)
      }
    }

    tryFindElement()
    timer = setInterval(tryFindElement, ELEMENT_POLL_INTERVAL_MS)

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isActive, currentStep, steps])

  // ── 3. Atualizar targetRect no resize/scroll ──────────────────────────────

  useEffect(() => {
    if (!isActive || steps.length === 0) return

    const step = steps[currentStep]
    if (!step?.targetId) return

    function updateRect() {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step!.targetId}"]`)
      if (el) setTargetRect(el.getBoundingClientRect())
    }

    window.addEventListener('resize', updateRect, { passive: true })
    window.addEventListener('scroll', updateRect, { passive: true, capture: true })

    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [isActive, currentStep, steps])

  // ── 4. Acessibilidade: ESC para pular ────────────────────────────────────

  const skipRef = useRef<() => void>(() => { /* será redefinido */ })

  useEffect(() => {
    if (!isActive) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') skipRef.current()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isActive])

  // ── 5. Ações do tour ──────────────────────────────────────────────────────

  const advance = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev + 1
      if (next >= steps.length) return prev
      return next
    })
  }, [steps.length])

  const back = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1))
  }, [])

  const skip = useCallback(async () => {
    if (isMutating.current) return
    isMutating.current = true

    // EVT-010: Tour de Onboarding Pulado
    track('onboarding_tour_skipped', {
      step_when_skipped: currentStep + 1,
      plan: userPlan as 'JOGADOR' | 'CRAQUE' | 'LENDA',
    })

    setIsActive(false)

    try {
      await fetch(`${API_BASE}/tour-skip`, { method: 'PATCH' })
    } catch {
      // best-effort
    } finally {
      isMutating.current = false
    }
  }, [currentStep, steps, investorProfile, track, userPlan])

  // Liga o skipRef ao skip para o listener de ESC
  useEffect(() => {
    skipRef.current = skip
  }, [skip])

  const complete = useCallback(async () => {
    if (isMutating.current) return
    isMutating.current = true

    // EVT-009: Tour de Onboarding Concluido
    track('onboarding_tour_completed', {
      steps_completed: steps.length,
      plan: userPlan as 'JOGADOR' | 'CRAQUE' | 'LENDA',
    })

    setIsActive(false)

    try {
      await fetch(`${API_BASE}/tour-completed`, { method: 'PATCH' })
    } catch {
      // best-effort
    } finally {
      isMutating.current = false
    }
  }, [investorProfile, steps.length, track, userPlan])

  return {
    isActive,
    isLoading,
    currentStep,
    steps,
    targetRect,
    investorProfile,
    advance,
    back,
    skip,
    complete,
  }
}
