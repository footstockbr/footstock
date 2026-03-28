// ============================================================================
// Foot Stock Motor — Tipos de Eventos Redis
// ============================================================================

import type { MotorTick, AdminAction } from './motor.types'

// ─── market:tick ──────────────────────────────────────────────────────────

export interface MarketTickEvent {
  type: 'TICK'
  timestamp: number
  ticks: MotorTick[]
}

// ─── motor:control ────────────────────────────────────────────────────────

export interface MotorControlEvent {
  type: AdminAction['type']
  assetId?: string
  payload?: Record<string, unknown>
  adminId: string
  reason: string
}

// ─── news:inject ─────────────────────────────────────────────────────────

export interface NewsInjectEvent {
  type: 'NEWS'
  assetId: string
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  magnitude: number        // 0.0 a 1.0
  durationTicks: number    // Quantos ticks o efeito persiste
}

// ─── Union types para serialização Redis ─────────────────────────────────

export type RedisEvent = MarketTickEvent | MotorControlEvent | NewsInjectEvent

export const REDIS_CHANNELS = {
  MARKET_TICK: 'market:tick',
  MOTOR_CONTROL: 'motor:control',
  NEWS_INJECT: 'news:inject',
} as const

export type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS]
