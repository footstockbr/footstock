// ============================================================================
// CONTRATO CROSS-ROCK: module-17 (producer) → module-14 (consumer)
// NÃO ALTERAR sem versionar e notificar a equipe responsável por module-14.
// Breaking changes exigem nova constante de channel (ex: news:inject:v2)
// Rastreabilidade: INT-046, INT-047
// ============================================================================

import { z } from 'zod'
import { ImpactCategory } from '../news/types'

// ---------------------------------------------------------------------------
// Canal Redis (não alterar sem criar v2)
// ---------------------------------------------------------------------------

export const NEWS_INJECT_CHANNEL = 'news:inject' as const

// ---------------------------------------------------------------------------
// Payload de validação interna (admin inject DTO + motor publish)
// ---------------------------------------------------------------------------

/** Payload publicado por module-17 no canal news:inject */
export interface NewsInjectPayload {
  newsId?: string
  title: string
  ticker: string              // ex: "FLM" — deve existir nos 40 ativos
  impactCategory: ImpactCategory
  sentiment: number           // -1.0 a 1.0 — nunca null
  source: string              // "ESPN Brasil" | "Globo Esporte" | "Lance!" | "Admin"
  publishedAt: string         // ISO 8601: "2026-03-25T09:00:00.000Z"
  correlationId?: string
  durationTicks?: number
  curveType?: 'canonical' | 'parameterized'
}

/**
 * Duração canônica do impacto em ticks (PRESSURE_SPREAD_TICKS + ABSORPTION_TICKS).
 * L7_PressureQueue computa `ticksElapsed = TOTAL - newsImpactTicks` para
 * progredir na curva de decaimento. Se `newsImpactTicks` começar abaixo do total,
 * a notícia entra direto na cauda da absorção e some sem efeito perceptível.
 */
export const NEWS_IMPACT_DURATION_TICKS = 50

// ---------------------------------------------------------------------------
// Schema Zod (validação runtime — producer e consumer)
// ---------------------------------------------------------------------------

export const newsInjectPayloadSchema = z.object({
  newsId: z.string().min(1).optional(),
  title: z.string().min(1),
  ticker: z.string().min(1).max(4),
  impactCategory: z.nativeEnum(ImpactCategory),
  sentiment: z.number().min(-1).max(1),
  source: z.string().min(1),
  publishedAt: z.string().datetime({ message: 'publishedAt deve ser ISO 8601' }),
  correlationId: z.string().min(1).optional(),
  curveType: z.enum(['canonical', 'parameterized']).default('canonical'),
  durationTicks: z.number().int().positive().optional(),
}).passthrough().superRefine((payload, ctx) => {
  if ((payload.curveType ?? 'canonical') === 'canonical' && payload.durationTicks !== undefined && payload.durationTicks !== NEWS_IMPACT_DURATION_TICKS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `durationTicks deve ser ${NEWS_IMPACT_DURATION_TICKS} quando curveType='canonical'`,
      path: ['durationTicks'],
    })
  }
}) // forward-compatibility: campos extras não quebram o contrato

/**
 * Valida se o payload é um NewsInjectPayload válido.
 * Nunca lança exceção — retorna false para payloads inválidos.
 */
export function validateNewsInjectPayload(payload: unknown): payload is NewsInjectPayload {
  return newsInjectPayloadSchema.safeParse(payload).success
}

// ---------------------------------------------------------------------------
// Evento Redis formatado para module-14 (NewsInjectEvent)
// ---------------------------------------------------------------------------

/**
 * @deprecated `sentiment` não controla a duração — a curva de L7 exige o total fixo.
 * Mantido por compat de assinatura; retorna sempre `NEWS_IMPACT_DURATION_TICKS`.
 * Use a constante diretamente em novo código.
 */
export function sentimentToDurationTicks(_sentiment: number): number {
  return NEWS_IMPACT_DURATION_TICKS
}
