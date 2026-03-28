'use client'

import { useMarketTick } from '@/hooks/useMarketTick'

export function useAssetStatus(ticker: string) {
  const tick = useMarketTick(ticker)
  return {
    isHalted: tick?.isHalted ?? false,
    haltReason: tick?.haltReason ?? null,
    estimatedResume: tick?.estimatedResume ?? null,
  }
}
