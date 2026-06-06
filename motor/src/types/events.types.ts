// ============================================================================
// FootStock Motor — Tipos de Eventos Redis
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
  reason?: string
  correlationId?: string
}

// ─── news:inject ─────────────────────────────────────────────────────────

export type ImpactCategoryType =
  | 'FINANCEIRA_CRITICA'
  | 'ESPORTIVA_MAJORITARIA'
  | 'MERCADO_ATIVOS'
  | 'INTEGRIDADE_SAUDE'
  | 'INSTITUCIONAL'
  | 'ESPORTIVA_MENOR'

export interface NewsInjectEvent {
  type: 'NEWS'
  assetId: string
  newsId?: string
  title?: string
  source?: string
  impact: ImpactCategoryType
  impactCategory?: ImpactCategoryType
  sentiment?: number | string
  publishedAt?: string
  correlationId?: string
  magnitude: number        // derivado de IMPACT_MAGNITUDE
  durationTicks: number
  curveType?: 'canonical' | 'parameterized'
}

// ─── Union types para serialização Redis ─────────────────────────────────

export type RedisEvent = MarketTickEvent | MotorControlEvent | NewsInjectEvent

export const REDIS_CHANNELS = {
  MARKET_TICK: 'market:tick',
  MOTOR_CONTROL: 'motor:control',
  NEWS_INJECT: 'news:inject',
} as const

export type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS]
