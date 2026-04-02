'use client'

// ============================================================================
// Foot Stock — useUpgradePrompt: hook reutilizável para modal de upgrade
// Controla abertura, feature bloqueada e plano sugerido
// ============================================================================

import { useState, useCallback } from 'react'
import type { PlanType } from '@/lib/enums'

export const FEATURE_TO_PLAN: Record<string, PlanType> = {
  'Ordens Limitadas': 'CRAQUE',
  'Ordens Agendadas': 'CRAQUE',
  'Short Selling': 'LENDA',
  'Alavancagem 2x': 'LENDA',
  'MM9 + MM21': 'LENDA',
  'Cotação Tempo Real': 'LENDA',
  'Assessor IA': 'CRAQUE',
  'Assessor IA VIP': 'LENDA',
  'Ligas PRO': 'LENDA',
}

export interface UpgradePromptState {
  isOpen: boolean
  blockedFeature: string | null
  suggestedPlan: PlanType | null
}

export interface UpgradePromptHook extends UpgradePromptState {
  open: (feature: string) => void
  close: () => void
}

export function useUpgradePrompt(): UpgradePromptHook {
  const [state, setState] = useState<UpgradePromptState>({
    isOpen: false,
    blockedFeature: null,
    suggestedPlan: null,
  })

  const open = useCallback((feature: string) => {
    const suggestedPlan = FEATURE_TO_PLAN[feature] ?? 'CRAQUE'
    setState({ isOpen: true, blockedFeature: feature, suggestedPlan })
  }, [])

  const close = useCallback(() => {
    setState({ isOpen: false, blockedFeature: null, suggestedPlan: null })
  }, [])

  return { ...state, open, close }
}
