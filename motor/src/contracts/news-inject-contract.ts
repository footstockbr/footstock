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
  title: string
  ticker: string              // ex: "FLM" — deve existir nos 40 ativos
  impactCategory: ImpactCategory
  sentiment: number           // -1.0 a 1.0 — nunca null
  source: string              // "ESPN Brasil" | "Globo Esporte" | "Lance!" | "Admin"
  publishedAt: string         // ISO 8601: "2026-03-25T09:00:00.000Z"
}

// ---------------------------------------------------------------------------
// Schema Zod (validação runtime — producer e consumer)
// ---------------------------------------------------------------------------

export const newsInjectPayloadSchema = z.object({
  title: z.string().min(1),
  ticker: z.string().min(1).max(4),
  impactCategory: z.nativeEnum(ImpactCategory),
  sentiment: z.number().min(-1).max(1),
  source: z.string().min(1),
  publishedAt: z.string().datetime({ message: 'publishedAt deve ser ISO 8601' }),
}).passthrough() // forward-compatibility: campos extras não quebram o contrato

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

/** Duração padrão do impacto em ticks (sentiment * 5, mínimo 1, máximo 10) */
export function sentimentToDurationTicks(sentiment: number): number {
  return Math.max(1, Math.min(10, Math.round(Math.abs(sentiment) * 5)))
}
