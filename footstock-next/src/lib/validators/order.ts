// ============================================================================
// FootStock — Validador Zod de criação de ordens
// Valida DTOs de criação de ordem com regras estruturais e cruzadas.
// Rastreabilidade: INT-011..015, INT-019 / TASK-1/ST001
// ============================================================================

import { z } from 'zod'
import { ORDER_TYPE, ORDER_SIDE, PLAN_TYPE, type PlanType } from '@/lib/enums'
import { ALLOWED_ORDER_TYPES_BY_PLAN } from '@/lib/services/plan-order-limits'

// ---------------------------------------------------------------------------
// Contrato OCO — fonte unica da relacao de precos
// ---------------------------------------------------------------------------

/**
 * Codigos de falha do contrato OCO.
 * `SIDE_NOT_SELL`  — OCO so existe como venda protetiva de posicao LONG.
 * `MISSING_PRICES` — falta price, stopLossPrice ou takeProfitPrice.
 * `INVALID_RELATION` — a relacao canonica stopLoss < price < takeProfit foi violada.
 */
export type OcoViolationCode = 'SIDE_NOT_SELL' | 'MISSING_PRICES' | 'INVALID_RELATION'

export type OcoViolationField = 'side' | 'price' | 'stopLossPrice'

export interface OcoPriceRelationInput {
  side: string
  price?: number | null
  stopLossPrice?: number | null
  takeProfitPrice?: number | null
}

export interface OcoPriceRelationResult {
  valid: boolean
  code?: OcoViolationCode
  field?: OcoViolationField
  message?: string
}

/** Mensagens canonicas, compartilhadas entre formulario e validador. */
export const OCO_VIOLATION_MESSAGES: Record<OcoViolationCode, string> = {
  SIDE_NOT_SELL:
    'OCO disponível apenas para venda protetiva (side=SELL) de posição existente. (ORDER_054)',
  MISSING_PRICES: 'Ordens OCO requerem price, stopLossPrice e takeProfitPrice. (ORDER_054)',
  INVALID_RELATION:
    'OCO: stopLossPrice deve ser menor que price, que deve ser menor que takeProfitPrice. (ORDER_054)',
}

const OCO_VIOLATION_FIELDS: Record<OcoViolationCode, OcoViolationField> = {
  SIDE_NOT_SELL: 'side',
  MISSING_PRICES: 'price',
  INVALID_RELATION: 'stopLossPrice',
}

function ocoViolation(code: OcoViolationCode): OcoPriceRelationResult {
  return {
    valid: false,
    code,
    field: OCO_VIOLATION_FIELDS[code],
    message: OCO_VIOLATION_MESSAGES[code],
  }
}

/**
 * Fonte unica da relacao de precos OCO.
 *
 * OCO e uma protecao de posicao LONG: SELL-only, com take-profit acima e
 * stop-loss abaixo do preco de referencia. A relacao canonica e
 * `stopLossPrice < price < takeProfitPrice`, com limites de igualdade rejeitados.
 *
 * Formulario (`OrderForm.tsx`) e validador Zod chamam este helper, de modo que
 * nao existe segunda definicao da relacao passivel de divergir de sinal.
 */
export function validateOcoPriceRelation(input: OcoPriceRelationInput): OcoPriceRelationResult {
  if (input.side !== ORDER_SIDE.SELL) return ocoViolation('SIDE_NOT_SELL')

  const { price, stopLossPrice, takeProfitPrice } = input
  const missing =
    price === undefined || price === null || !(price > 0) ||
    stopLossPrice === undefined || stopLossPrice === null || !(stopLossPrice > 0) ||
    takeProfitPrice === undefined || takeProfitPrice === null || !(takeProfitPrice > 0)

  if (missing) return ocoViolation('MISSING_PRICES')

  if (!((stopLossPrice as number) < (price as number) && (price as number) < (takeProfitPrice as number))) {
    return ocoViolation('INVALID_RELATION')
  }

  return { valid: true }
}

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

    // Quantidade livre (cota a cota): inteiro positivo, mínimo 1 cota.
    // A antiga regra de lote (múltiplo de 100) foi removida em 2026-07-02.
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

    // OCO é uma proteção de posição LONG: SELL-only (take-profit acima + stop-loss
    // abaixo do preço de referência). BUY OCO não tem posição a proteger e nunca
    // foi liquidado corretamente pelo motor — rejeitado explicitamente.
    if (data.type === ORDER_TYPE.OCO) {
      //   stopLossPrice   → vende se o preço CAIR até esse piso (limita perda)
      //   takeProfitPrice → vende se o preço SUBIR até esse alvo (realiza lucro)
      // A relacao vive em validateOcoPriceRelation(), compartilhada com o formulario.
      const oco = validateOcoPriceRelation({
        side: data.side,
        price: data.price,
        stopLossPrice: data.stopLossPrice,
        takeProfitPrice: data.takeProfitPrice,
      })
      if (!oco.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [oco.field as string],
          message: oco.message as string,
        })
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
