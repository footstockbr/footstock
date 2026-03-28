'use client'

import { useState, useCallback } from 'react'
import { MESSAGES } from '@/lib/constants/messages'

export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return true
    } catch {
      return false
    }
  }, [])

  return { copy, copied, label: copied ? MESSAGES.GENERIC.COPIED : 'Copiar' }
}
