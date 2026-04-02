// ============================================================================
// Foot Stock — Testes: order validator (Zod)
// Rastreabilidade: INT-011..015, INT-019 / TASK-1/ST001
// ============================================================================

import { CreateOrderSchema, validateOrderForPlan } from './order'
import { PLAN_TYPE } from '@/lib/enums'

const validMarket = { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 10 }

describe('CreateOrderSchema', () => {
  describe('MARKET', () => {
    it('aceita MARKET válido', () => {
      const result = CreateOrderSchema.safeParse(validMarket)
      expect(result.success).toBe(true)
    })

    it('normaliza ticker para maiúsculas', () => {
      const result = CreateOrderSchema.safeParse({ ...validMarket, ticker: 'var1' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.ticker).toBe('VAR1')
    })

    it('rejeita quantity inválida', () => {
      const result = CreateOrderSchema.safeParse({ ...validMarket, quantity: 0 })
      expect(result.success).toBe(false)
    })

    it('rejeita ticker com formato inválido', () => {
      const result = CreateOrderSchema.safeParse({ ...validMarket, ticker: 'TOOLONG123' })
      expect(result.success).toBe(false)
    })
  })

  describe('LIMIT', () => {
    it('aceita LIMIT com price', () => {
      const result = CreateOrderSchema.safeParse({ ...validMarket, type: 'LIMIT', price: 95 })
      expect(result.success).toBe(true)
    })

    it('rejeita LIMIT sem price (ORDER_054)', () => {
      const result = CreateOrderSchema.safeParse({ ...validMarket, type: 'LIMIT' })
      expect(result.success).toBe(false)
      if (!result.success) {
        const msgs = result.error.issues.map(i => i.message).join(' ')
        expect(msgs).toContain('ORDER_054')
      }
    })
  })

  describe('OCO', () => {
    it('aceita OCO BUY válido (stopLoss < price < takeProfit)', () => {
      const result = CreateOrderSchema.safeParse({
        ...validMarket,
        type: 'OCO',
        price: 100,
        stopLossPrice: 80,
        takeProfitPrice: 120,
      })
      expect(result.success).toBe(true)
    })

    it('rejeita OCO BUY com stopLoss > price (ORDER_054)', () => {
      const result = CreateOrderSchema.safeParse({
        ...validMarket,
        type: 'OCO',
        price: 50,
        stopLossPrice: 60,
        takeProfitPrice: 70,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const msgs = result.error.issues.map(i => i.message).join(' ')
        expect(msgs).toContain('ORDER_054')
      }
    })

    it('rejeita OCO sem todos os campos (ORDER_054)', () => {
      const result = CreateOrderSchema.safeParse({
        ...validMarket,
        type: 'OCO',
        price: 100,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('SCHEDULED', () => {
    it('aceita SCHEDULED com scheduledAt no futuro', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      const result = CreateOrderSchema.safeParse({
        ...validMarket,
        type: 'SCHEDULED',
        scheduledAt: futureDate,
      })
      expect(result.success).toBe(true)
    })

    it('rejeita SCHEDULED com scheduledAt no passado (ORDER_055)', () => {
      const result = CreateOrderSchema.safeParse({
        ...validMarket,
        type: 'SCHEDULED',
        scheduledAt: '2020-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const msgs = result.error.issues.map(i => i.message).join(' ')
        expect(msgs).toContain('ORDER_055')
      }
    })

    it('rejeita SCHEDULED sem scheduledAt (ORDER_055)', () => {
      const result = CreateOrderSchema.safeParse({ ...validMarket, type: 'SCHEDULED' })
      expect(result.success).toBe(false)
    })
  })
})

describe('validateOrderForPlan', () => {
  it('JOGADOR + MARKET: válido', () => {
    const dto = CreateOrderSchema.parse(validMarket)
    const result = validateOrderForPlan(dto, PLAN_TYPE.JOGADOR)
    expect(result.valid).toBe(true)
  })

  it('JOGADOR + LIMIT: inválido (ORDER_051)', () => {
    const dto = CreateOrderSchema.parse({ ...validMarket, type: 'LIMIT', price: 90 })
    const result = validateOrderForPlan(dto, PLAN_TYPE.JOGADOR)
    expect(result.valid).toBe(false)
    expect(result.errorCode).toBe('ORDER_051')
    expect(result.requiredPlan).toBe(PLAN_TYPE.CRAQUE)
  })

  it('CRAQUE + LIMIT: válido', () => {
    const dto = CreateOrderSchema.parse({ ...validMarket, type: 'LIMIT', price: 90 })
    const result = validateOrderForPlan(dto, PLAN_TYPE.CRAQUE)
    expect(result.valid).toBe(true)
  })

  it('CRAQUE + OCO: inválido (requer LENDA)', () => {
    const dto = CreateOrderSchema.parse({
      ...validMarket,
      type: 'OCO',
      price: 100,
      stopLossPrice: 80,
      takeProfitPrice: 120,
    })
    const result = validateOrderForPlan(dto, PLAN_TYPE.CRAQUE)
    expect(result.valid).toBe(false)
    expect(result.requiredPlan).toBe(PLAN_TYPE.LENDA)
  })

  it('LENDA + OCO: válido', () => {
    const dto = CreateOrderSchema.parse({
      ...validMarket,
      type: 'OCO',
      price: 100,
      stopLossPrice: 80,
      takeProfitPrice: 120,
    })
    const result = validateOrderForPlan(dto, PLAN_TYPE.LENDA)
    expect(result.valid).toBe(true)
  })

  it('CRAQUE + leverage=2: inválido (ORDER_051)', () => {
    // leverage é aceito pelo schema mas bloqueado pela validação de plano
    const dto = { ...CreateOrderSchema.parse(validMarket), leverage: 2 as const }
    const result = validateOrderForPlan(dto, PLAN_TYPE.CRAQUE)
    expect(result.valid).toBe(false)
    expect(result.requiredPlan).toBe(PLAN_TYPE.LENDA)
  })
})
