// ============================================================================
// FootStock — Validador Zod de criação de ordens
// Valida DTOs de criação de ordem com regras estruturais e cruzadas.
// Rastreabilidade: INT-011..015, INT-019 / TASK-1/ST001
// ============================================================================

import { z } from 'zod'
import { ORDER_TYPE, ORDER_SIDE, PLAN_TYPE, type PlanType } from '@/lib/enums'
import { ALLOWED_ORDER_TYPES_BY_PLAN } from '@/lib/services/plan-order-limits'

// ---------------------------------------------------------------------------
// Schema de criação de ordem
// ---------------------------------------------------------------------------

export const CreateOrderSchema = z
  .object({
    ticker: z
      .string()
      .toUpperCase()
      .regex(/^[A-Z]{2,5}\d{0,2}$/, 'Ticker inválido. Formato esperado: 2-5 letras + até 2 números.'),

    type: z.enum(
      [ORDER_TYPE.MARKET, ORDER_TYPE.LIMIT, ORDER_TYPE.OCO, ORDER_TYPE.SCHEDULED] as [string, ...string[]],
      { message: 'Tipo de ordem inválido. Use MARKET, LIMIT, OCO ou SCHEDULED.' }
    ),

    side: z.enum([ORDER_SIDE.BUY, ORDER_SIDE.SELL] as [string, ...string[]], {
      message: 'Lado da operação inválido. Use BUY ou SELL.',
    }),

    quantity: z
      .number({ message: 'quantity deve ser um número inteiro positivo.' })
      .int('quantity deve ser um número inteiro.')
      .positive('quantity deve ser maior que zero.')
      .min(1, 'quantity mínimo é 1.'),

    price: z.number().positive('price deve ser maior que zero.').optional(),

    stopLossPrice: z.number().positive('stopLossPrice deve ser maior que zero.').optional(),

    takeProfitPrice: z.number().positive('takeProfitPrice deve ser maior que zero.').optional(),

    scheduledAt: z
      .string()
      .datetime({ message: 'scheduledAt deve ser uma data/hora ISO 8601 válida.' })
      .optional(),

    leverage: z.literal(2).optional(),

    // Liga PRO opcional — quando presente, valida permiteAlavancagem antes de aceitar ordem alavancada
    leagueId: z.string().cuid('leagueId inválido.').optional(),
  })
  .superRefine((data, ctx) => {
    // LIMIT requer price
    if (data.type === ORDER_TYPE.LIMIT && data.price === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Ordens LIMIT requerem o campo price. (ORDER_054)',
      })
    }

    // OCO requer price, stopLossPrice, takeProfitPrice
    if (data.type === ORDER_TYPE.OCO) {
      if (data.price === undefined || data.stopLossPrice === undefined || data.takeProfitPrice === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['price'],
          message: 'Ordens OCO requerem price, stopLossPrice e takeProfitPrice. (ORDER_054)',
        })
        return
      }

      // BUY OCO: stopLoss < price < takeProfit
      if (data.side === ORDER_SIDE.BUY) {
        if (!(data.stopLossPrice < data.price && data.price < data.takeProfitPrice)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['stopLossPrice'],
            message: 'OCO BUY: stopLossPrice deve ser menor que price, que deve ser menor que takeProfitPrice. (ORDER_054)',
          })
        }
      }

      // SELL OCO: takeProfit < price < stopLoss (proteção contra queda)
      if (data.side === ORDER_SIDE.SELL) {
        if (!(data.takeProfitPrice < data.price && data.price < data.stopLossPrice)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['stopLossPrice'],
            message: 'OCO SELL: takeProfitPrice deve ser menor que price, que deve ser menor que stopLossPrice. (ORDER_054)',
          })
        }
      }
    }

    // SCHEDULED requer scheduledAt no futuro
    if (data.type === ORDER_TYPE.SCHEDULED) {
      if (!data.scheduledAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scheduledAt'],
          message: 'Ordens SCHEDULED requerem o campo scheduledAt. (ORDER_055)',
        })
        return
      }
      if (new Date(data.scheduledAt) <= new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scheduledAt'],
          message: 'A data de agendamento deve ser no futuro. (ORDER_055)',
        })
      }
    }
  })

export type CreateOrderDTO = z.infer<typeof CreateOrderSchema>

// ---------------------------------------------------------------------------
// Validação de tipo de ordem por plano
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean
  errorCode?: string
  requiredPlan?: string
  message?: string
}

export function validateOrderForPlan(
  dto: CreateOrderDTO,
  planType: PlanType,
  opts?: { skipLeverageCheck?: boolean }
): ValidationResult {
  const allowed = ALLOWED_ORDER_TYPES_BY_PLAN[planType]

  if (!allowed.includes(dto.type)) {
    let requiredPlan: string
    if (dto.type === ORDER_TYPE.OCO) {
      requiredPlan = PLAN_TYPE.LENDA
    } else if (dto.type === ORDER_TYPE.LIMIT || dto.type === ORDER_TYPE.SCHEDULED) {
      requiredPlan = PLAN_TYPE.CRAQUE
    } else {
      requiredPlan = PLAN_TYPE.CRAQUE
    }

    return {
      valid: false,
      errorCode: 'ORDER_051',
      requiredPlan,
      message: `Tipo de ordem ${dto.type} não permitido no plano ${planType}. Faça upgrade para ${requiredPlan}.`,
    }
  }

  // Alavancagem 2x: validação de plano pode ser pulada quando LeverageService
  // já validou o contexto de liga PRO (onde qualquer plano pode usar alavancagem).
  if (!opts?.skipLeverageCheck && dto.leverage === 2 && planType !== PLAN_TYPE.LENDA) {
    return {
      valid: false,
      errorCode: 'ORDER_051',
      requiredPlan: PLAN_TYPE.LENDA,
      message: 'Alavancagem 2x requer plano LENDA.',
    }
  }

  return { valid: true }
}
