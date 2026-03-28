'use client'

// ============================================================================
// Foot Stock — usePriceFlash
// Detecta variação de preço e retorna a direção para animação CSS.
// ============================================================================

import { useState, useEffect, useRef } from 'react'

export function usePriceFlash(price: number): 'up' | 'down' | null {
  const prevPrice = useRef(price)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (price !== prevPrice.current) {
      setFlash(price > prevPrice.current ? 'up' : 'down')
      prevPrice.current = price
      const timer = setTimeout(() => setFlash(null), 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [price])

  return flash
}
