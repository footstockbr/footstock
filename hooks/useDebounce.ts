'use client'

import { useState, useEffect } from 'react'
import { DEBOUNCE_MS } from '@/lib/constants/timing'

/**
 * Adia a atualizacao de um valor pelo delay especificado.
 * Util para inputs de busca — evita requisicoes a cada keystroke.
 */
export function useDebounce<T>(value: T, delay: number = DEBOUNCE_MS): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
