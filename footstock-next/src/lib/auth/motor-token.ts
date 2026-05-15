import 'server-only'

import { SignJWT } from 'jose'

import { env } from '@/lib/env'
import type { PlanType } from '@/types'

export const MOTOR_TOKEN_TTL_SECONDS = 5 * 60

export interface MotorTokenPayload {
  sub: string
  email?: string
  planType: PlanType
}

export interface MintedMotorToken {
  token: string
  /** Unix epoch seconds when token expires (matches JWT `exp`). */
  expiresAt: number
}

/**
 * NXAUTH-04B — mints HS256 JWT compatível com motor `verifyJwt`
 * (motor/src/lib/auth.ts: requires sub + planType ∈ {JOGADOR, CRAQUE, LENDA}).
 * Assinado com JWT_SECRET compartilhado entre web e motor.
 */
export async function mintMotorToken(payload: MotorTokenPayload): Promise<MintedMotorToken> {
  const secret = new TextEncoder().encode(env.JWT_SECRET)
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + MOTOR_TOKEN_TTL_SECONDS

  const jwtBuilder = new SignJWT({ planType: payload.planType, ...(payload.email ? { email: payload.email } : {}) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)

  const token = await jwtBuilder.sign(secret)
  return { token, expiresAt }
}
