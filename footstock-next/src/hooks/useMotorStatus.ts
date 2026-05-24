'use client'

// ============================================================================
// FootStock — useMotorStatus
// Polling do endpoint /api/v1/health/motor a cada 10s.
// Frequência alinhada ao intervalo de publicação do heartbeat do motor.
// Grace period: banner só aparece após 3 polls consecutivos offline (≈30s),
// evitando falso positivo durante restart do motor.
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { useRef, useState, useEffect } from 'react'

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

const OFFLINE_GRACE_POLLS = 3  // mostra banner após 3 polls consecutivos offline (≈30s)

export function useMotorStatus(): UseMotorStatusReturn {
  const { data, isLoading, isError } = useQuery<MotorStatus, Error>({
    queryKey: ['motor-status'],
    queryFn: fetchMotorStatus,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: 1,
  })

  const consecutiveOffline = useRef(0)
  const [confirmedOffline, setConfirmedOffline] = useState(false)

  const pollIsOnline = !isError && data?.status === 'online'

  useEffect(() => {
    if (isLoading) return
    if (pollIsOnline) {
      consecutiveOffline.current = 0
      setConfirmedOffline(false)
    } else {
      consecutiveOffline.current += 1
      if (consecutiveOffline.current >= OFFLINE_GRACE_POLLS) {
        setConfirmedOffline(true)
      }
    }
  }, [pollIsOnline, isLoading])

  return {
    isOnline: pollIsOnline,
    isOffline: confirmedOffline,
    lastTick: data?.lastTick ?? null,
    isLoading,
  }
}
