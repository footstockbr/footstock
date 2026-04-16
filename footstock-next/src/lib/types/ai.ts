// ============================================================================
// FootStock — Tipos TypeScript do módulo Assessor IA (module-21)
// Fonte: module-21/TASK-2/ST001
// ============================================================================

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Enums locais
// ---------------------------------------------------------------------------

export const AI_RECOMMENDATION = {
  BUY:  'COMPRAR',
  HOLD: 'MANTER',
  SELL: 'VENDER',
} as const
export type AIRecommendation = (typeof AI_RECOMMENDATION)[keyof typeof AI_RECOMMENDATION]

export const AI_RISK_LEVEL = {
  HIGH:   'ALTO',
  MEDIUM: 'MEDIO',
  LOW:    'BAIXO',
} as const
export type AIRiskLevel = (typeof AI_RISK_LEVEL)[keyof typeof AI_RISK_LEVEL]

// ---------------------------------------------------------------------------
// Interface principal de análise
// ---------------------------------------------------------------------------

export interface AIAnalysis {
  ticker: string
  resumo: string
  pontos_positivos: string[]
  pontos_negativos: string[]
  /** Sentimento geral: -1.0 (muito negativo) a +1.0 (muito positivo) */
  sentimento: number
  recomendacao: AIRecommendation
  risco: AIRiskLevel
  noticias_relevantes: string[]
  generatedAt: string     // ISO datetime
  isWebSearched: boolean  // true apenas para plano Lenda com web_search tool
  cached: boolean         // true quando servida do Redis cache
}

// ---------------------------------------------------------------------------
// Status do rate limit
// ---------------------------------------------------------------------------

export interface AIRateLimitStatus {
  allowed: boolean
  remaining: number  // requests restantes na janela de 1 hora
  resetAt: number    // Unix timestamp do próximo reset
}

// ---------------------------------------------------------------------------
// Contexto para construção do prompt
// ---------------------------------------------------------------------------

export interface AnalysisContext {
  currentPrice: number
  changePercent: number
  userPosition: { qty: number; avgPrice: number } | null
  recentNews: { title: string; sentiment: number }[]
}

// ---------------------------------------------------------------------------
// Schema Zod para validação da resposta do Claude
// ---------------------------------------------------------------------------

export const AIAnalysisSchema = z.object({
  resumo: z.string().min(10),
  pontos_positivos: z.array(z.string()).min(1).max(5),
  pontos_negativos: z.array(z.string()).min(1).max(5),
  sentimento: z.number().min(-1).max(1),
  recomendacao: z.enum(['COMPRAR', 'MANTER', 'VENDER']),
  risco: z.enum(['ALTO', 'MEDIO', 'BAIXO']),
  noticias_relevantes: z.array(z.string()),
})

export type AIAnalysisRaw = z.infer<typeof AIAnalysisSchema>
