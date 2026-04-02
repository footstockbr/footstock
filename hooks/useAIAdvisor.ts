// ============================================================================
// Foot Stock — useAIAdvisor (module-21/TASK-3/ST001)
// React Query para análises de IA com tratamento estruturado de 429 e 403
// ============================================================================

'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { AIAnalysis, AIRateLimitStatus } from '@/lib/types/ai'

interface AIAdvisorState {
  data: AIAnalysis | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  isRateLimited: boolean
  resetAt: number
  isPlanGated: boolean
  refetch: () => void
}

interface RateLimitStatusState {
  status: AIRateLimitStatus | null
  isLoading: boolean
}

async function fetchAnalysis(ticker: string): Promise<{
  analysis?: AIAnalysis
  isRateLimited: boolean
  resetAt: number
  isPlanGated: boolean
  remaining?: number
}> {
  const res = await fetch(`/api/v1/ai/analyze?ticker=${encodeURIComponent(ticker)}`)

  // 429 — rate limit atingido
  if (res.status === 429) {
    const resetAtHeader = res.headers.get('X-RateLimit-Reset')
    return {
      isRateLimited: true,
      resetAt: resetAtHeader ? parseInt(resetAtHeader, 10) : 0,
      isPlanGated: false,
    }
  }

  // 403 — plano insuficiente
  if (res.status === 403) {
    return { isRateLimited: false, resetAt: 0, isPlanGated: true }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = body?.error?.message ?? `Erro ${res.status}`
    throw new Error(msg)
  }

  // Extrair remaining do header para atualização imediata do badge
  const remainingHeader = res.headers.get('X-RateLimit-Remaining')
  const remaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined

  const body = await res.json()
  return {
    analysis: body.data as AIAnalysis,
    isRateLimited: false,
    resetAt: 0,
    isPlanGated: false,
    remaining,
  }
}

/**
 * Hook principal para análises do Assessor IA.
 * Não rethrow 429 nem 403 — retorna estados estruturados.
 * Cache React Query de 15min alinhado com o cache Redis.
 */
export function useAIAdvisor(ticker?: string): AIAdvisorState {
  const {
    data: queryData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ai-analysis', ticker],
    queryFn: () => fetchAnalysis(ticker!),
    enabled: !!ticker,
    staleTime: 900_000, // 15min — alinhado com TTL do cache Redis
    retry: false,
  })

  return {
    data: queryData?.analysis,
    isLoading,
    isError,
    error: isError ? (error as Error) : null,
    isRateLimited: queryData?.isRateLimited ?? false,
    resetAt: queryData?.resetAt ?? 0,
    isPlanGated: queryData?.isPlanGated ?? false,
    refetch,
  }
}

/**
 * Hook para polling do status de rate limit (usado pelo RateLimitBadge).
 * Polling a cada 30s. Lê do endpoint /rate-status sem incrementar o contador.
 */
export function useRateLimitStatus(): RateLimitStatusState {
  const [status, setStatus] = useState<AIRateLimitStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function poll() {
      try {
        const res = await fetch('/api/v1/ai/analyze/rate-status')
        if (res.ok && mounted) {
          const body = await res.json()
          setStatus(body.data as AIRateLimitStatus)
        }
      } catch {
        // silencioso — badge usa último valor conhecido
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    poll()
    const interval = setInterval(poll, 30_000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return { status, isLoading }
}
