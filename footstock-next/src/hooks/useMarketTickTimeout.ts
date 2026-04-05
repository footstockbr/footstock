'use client'

import { useEffect, useRef, useState } from 'react'
import { useMarketTick } from '@/hooks/useMarketTick'
import type { MarketTick } from '@/hooks/useMarketTick'

export function useMarketTickTimeout(
  ticker: string,
  timeoutMs = 10_000
): { tick: MarketTick | null; isTimedOut: boolean } {
  const tick = useMarketTick(ticker)
  const [isTimedOut, setIsTimedOut] = useState(false)
  const lastTickTime = useRef<number | null>(null)

  useEffect(() => {
    if (tick) {
      lastTickTime.current = Date.now()
      setIsTimedOut(false)
      return
    }

    const timer = setTimeout(() => {
      if (!lastTickTime.current || Date.now() - lastTickTime.current > timeoutMs) {
        setIsTimedOut(true)
      }
    }, timeoutMs)

    return () => clearTimeout(timer)
  }, [tick, timeoutMs])

  return { tick, isTimedOut }
}
