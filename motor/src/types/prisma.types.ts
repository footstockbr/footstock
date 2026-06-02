// ============================================================================
// FootStock Motor — Tipos Prisma locais
// O motor usa um cliente Prisma não gerado (stub), portanto os tipos de modelo
// precisam ser declarados aqui, derivados do schema.prisma canônico.
// ============================================================================

/** Decimal do Prisma: em runtime é um objeto Decimal.js, mas como number é
 *  suficiente para operações aritméticas no motor, usamos `number | string`
 *  para compatibilidade com o que o Prisma retorna (e Number() funciona nos dois casos). */
export type PrismaDecimal = { toNumber(): number } | number | string

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'OCO' | 'SCHEDULED'
export type OrderSide = 'BUY' | 'SELL'
export type OrderStatus = 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'PARTIAL'
export type PositionSide = 'LONG' | 'SHORT'
export type PositionStatus = 'OPEN' | 'CLOSED'

export interface PrismaOrder {
  id: string
  userId: string
  assetId: string
  type: OrderType
  side: OrderSide
  status: OrderStatus
  quantity: number
  price: PrismaDecimal | null
  executedPrice: PrismaDecimal | null
  fee: PrismaDecimal
  expiresAt: Date | null
  scheduledAt: Date | null
  groupId: string | null
  leverageMultiplier: number
  executedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PrismaPosition {
  id: string
  userId: string
  assetId: string
  quantity: number
  avgPrice: PrismaDecimal
  totalInvested: PrismaDecimal
  side: PositionSide
  status: PositionStatus
  marginBlocked: PrismaDecimal
  leverageMultiplier: number
  leverageAmount: PrismaDecimal
  dailyInterestRate: PrismaDecimal
  interestAccrued: PrismaDecimal
  openedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
