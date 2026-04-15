'use client'

// ============================================================================
// Foot Stock — useMotorStatus
// Polling do endpoint /api/v1/health/motor a cada 10s.
// Frequência alinhada ao intervalo de publicação do heartbeat do motor.
// Fail-safe: assume offline quando fetch falha.
// ============================================================================

import { useQuery } from '@tanstack/react-query'

export interface MotorStatus {
  status: 'online' | 'offline'
  lastTick: string | null
  timeSinceLastTick: number | null
  nextCheck: number
}

async function fetchMotorStatus(): Promise<MotorStatus> {
  const res = await fetch('/api/v1/health/motor', {
    cache: 'no-store',
    headers: { 'Accept': 'application/json' },
  })

  const data = await res.json() as MotorStatus
  return data
}

export interface UseMotorStatusReturn {
  isOnline: boolean
  isOffline: boolean
  lastTick: string | null
  isLoading: boolean
}

export function useMotorStatus(): UseMotorStatusReturn {
  const { data, isLoading, isError } = useQuery<MotorStatus, Error>({
    queryKey: ['motor-status'],
    queryFn: fetchMotorStatus,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: 1,
  })

  // Fail-safe: se erro de fetch ou status offline → isOnline=false
  const isOnline = !isError && data?.status === 'online'

  return {
    isOnline,
    isOffline: !isLoading && !isOnline,
    lastTick: data?.lastTick ?? null,
    isLoading,
  }
}
