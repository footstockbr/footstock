'use client'

// ============================================================================
// CancellationCountdown — exibe tempo restante até expiração do lock (T+7d)
// Atualiza a cada minuto (não segundos — countdown é em dias/horas/minutos)
// ============================================================================

import { useEffect, useState } from 'react'

interface Props {
  expiresAt: string // ISO string UTC
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  expired: boolean
}

function calcTimeLeft(expiresAt: string): TimeLeft {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, expired: true }

  const totalMinutes = Math.floor(diff / 60_000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  return { days, hours, minutes, expired: false }
}

export function CancellationCountdown({ expiresAt }: Props) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(expiresAt))

  useEffect(() => {
    setTimeLeft(calcTimeLeft(expiresAt))
    const interval = setInterval(() => {
      const next = calcTimeLeft(expiresAt)
      setTimeLeft(next)
      if (next.expired) clearInterval(interval)
    }, 60_000) // atualiza a cada minuto

    return () => clearInterval(interval)
  }, [expiresAt])

  if (timeLeft.expired) {
    return (
      <span className="font-semibold text-red-600">Janela expirada</span>
    )
  }

  const parts: string[] = []
  if (timeLeft.days > 0) parts.push(`${timeLeft.days}d`)
  if (timeLeft.hours > 0) parts.push(`${timeLeft.hours}h`)
  parts.push(`${timeLeft.minutes}min`)

  return (
    <span className="font-semibold tabular-nums">
      {parts.join(' ')}
    </span>
  )
}
