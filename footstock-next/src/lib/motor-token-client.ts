'use client'

/**
 * NXAUTH-04B — client helper para o token bridge Auth.js → motor.
 *
 * Usado pelos hooks SSE (useMarketTick, useAllMarketTicks) para obter um JWT
 * HS256 minted pelo `/api/v1/motor/token` a partir da sessão Auth.js.
 *
 * Refresh: agenda um callback ~60s antes do `expiresAt` (TTL = 5min, refresh
 * a cada ~4min). Mínimo de 5s para evitar tight loop em casos patológicos.
 */

interface MotorTokenResponse {
  token: string
  expiresAt: number
  ttlSeconds: number
}

const REFRESH_LEAD_TIME_MS = 60 * 1000
const MIN_REFRESH_DELAY_MS = 5 * 1000

export async function fetchMotorToken(): Promise<MotorTokenResponse | null> {
  try {
    const res = await fetch('/api/v1/motor/token', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as MotorTokenResponse
  } catch {
    return null
  }
}

export function scheduleMotorTokenRefresh(
  expiresAtSeconds: number,
  onRefresh: () => void,
): ReturnType<typeof setTimeout> {
  const expiresAtMs = expiresAtSeconds * 1000
  const delay = Math.max(MIN_REFRESH_DELAY_MS, expiresAtMs - Date.now() - REFRESH_LEAD_TIME_MS)
  return setTimeout(onRefresh, delay)
}
