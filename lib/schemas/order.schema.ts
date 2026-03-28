// ============================================================================
// Foot Stock — Schema de Ordens (Zod)
// ============================================================================

import { z } from 'zod';
import { ORDER_TYPE, ORDER_SIDE } from '@/lib/enums';

// ---------------------------------------------------------------------------
// ST005: Schema de criação de ordem com validação condicional
// ---------------------------------------------------------------------------

/** Schema de criação de ordem */
export const createOrderSchema = z
  .object({
    ticker: z
      .string({ required_error: 'Ticker é obrigatório.' })
      .min(3, 'Ticker deve ter no mínimo 3 caracteres.')
      .max(10, 'Ticker deve ter no máximo 10 caracteres.')
      .toUpperCase()
      .trim(),
    type: z.nativeEnum(
      Object.fromEntries(
        Object.entries(ORDER_TYPE).map(([k, v]) => [k, v]),
      ) as typeof ORDER_TYPE,
      {
        required_error: 'Tipo da ordem é obrigatório.',
        errorMap: () => ({ message: 'Tipo de ordem inválido.' }),
      },
    ),
    side: z.nativeEnum(
      Object.fromEntries(
        Object.entries(ORDER_SIDE).map(([k, v]) => [k, v]),
      ) as typeof ORDER_SIDE,
      {
        required_error: 'Lado da operação é obrigatório.',
        errorMap: () => ({ message: 'Lado da operação inválido.' }),
      },
    ),
    quantity: z
      .number({ required_error: 'Quantidade é obrigatória.' })
      .int('Quantidade deve ser um número inteiro.')
      .positive('Quantidade deve ser maior que zero.')
      .max(100_000, 'Quantidade máxima por ordem é 100.000.'),
    price: z
      .number()
      .positive('Preço deve ser maior que zero.')
      .optional(),
    stopLoss: z
      .number()
      .positive('Stop Loss deve ser maior que zero.')
      .optional(),
    takeProfit: z
      .number()
      .positive('Take Profit deve ser maior que zero.')
      .optional(),
    scheduledAt: z
      .string()
      .datetime('Data de agendamento deve ser uma data ISO válida.')
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Ordem LIMIT exige preço
    if (data.type === ORDER_TYPE.LIMIT && data.price == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ordens do tipo LIMIT exigem preço.',
        path: ['price'],
      });
    }

    // Ordem OCO exige stopLoss e takeProfit
    if (data.type === ORDER_TYPE.OCO) {
      if (data.stopLoss == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ordens do tipo OCO exigem Stop Loss.',
          path: ['stopLoss'],
        });
      }
      if (data.takeProfit == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ordens do tipo OCO exigem Take Profit.',
          path: ['takeProfit'],
        });
      }
    }

    // Ordem SCHEDULED exige scheduledAt
    if (data.type === ORDER_TYPE.SCHEDULED && data.scheduledAt == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ordens do tipo SCHEDULED exigem data de agendamento.',
        path: ['scheduledAt'],
      });
    }

    // stopLoss deve ser menor que takeProfit quando ambos existem
    if (
      data.stopLoss != null &&
      data.takeProfit != null &&
      data.stopLoss >= data.takeProfit
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Stop Loss deve ser menor que Take Profit.',
        path: ['stopLoss'],
      });
    }
  });

// ---------------------------------------------------------------------------
// Tipo inferido
// ---------------------------------------------------------------------------

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
