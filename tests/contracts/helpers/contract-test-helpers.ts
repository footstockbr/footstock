// ============================================================================
// Foot Stock — Contract Test Helpers
// Schemas Zod + assertion helpers + factories para testes de contrato
// Rastreabilidade: module-28/TASK-0/ST003
// ============================================================================

import { z } from 'zod'

// ─── Tipos locais para os contratos Redis ───────────────────────────────────
// Espelhado de types/market.ts e motor/src/contracts/news-inject-contract.ts
// NÃO importar do motor diretamente (processo separado)

/** Valores válidos de sentimento do mercado — espelho do const SENTIMENT em lib/enums */
export const SENTIMENT_VALUES = [
  'MUITO_POSITIVO',
  'POSITIVO',
  'NEUTRO',
  'NEGATIVO',
  'MUITO_NEGATIVO',
] as const
export type SentimentValue = (typeof SENTIMENT_VALUES)[number]

/** Valores válidos de ImpactCategory — espelho do enum Prisma */
export const IMPACT_CATEGORY_VALUES = [
  'FINANCEIRA_CRITICA',
  'ESPORTIVA_MAJORITARIA',
  'MERCADO_ATIVOS',
  'INTEGRIDADE_SAUDE',
  'INSTITUCIONAL',
  'ESPORTIVA_MENOR',
] as const
export type ImpactCategoryValue = (typeof IMPACT_CATEGORY_VALUES)[number]

// ─── Schemas Zod por contrato ────────────────────────────────────────────────

/**
 * Schema do payload market:tick publicado no canal Redis.
 * Baseado em types/market.ts → MarketTickData.
 */
export const MarketTickSchema = z.object({
  ticker: z.string().min(1).max(8),
  price: z.number().positive(),
  change24h: z.number(),
  volume: z.number().nonnegative(),
  bid: z.number().positive(),
  ask: z.number().positive(),
  spread: z.number().nonnegative(),
  sentiment: z.enum(SENTIMENT_VALUES),
  timestamp: z.number().int().positive(),
  halted: z.boolean().optional(),
})

/**
 * Schema do payload news:inject publicado no canal Redis.
 * Baseado em motor/src/contracts/news-inject-contract.ts → NewsInjectPayload.
 */
export const NewsInjectPayloadSchema = z.object({
  title: z.string().min(1).max(300),
  ticker: z.string().min(1).max(8).optional(),
  impactCategory: z.enum(IMPACT_CATEGORY_VALUES),
  sentiment: z.number().min(-1).max(1),
  source: z.string().min(1),
  publishedAt: z.string().datetime(),
})

export type MarketTick = z.infer<typeof MarketTickSchema>
export type NewsInjectPayload = z.infer<typeof NewsInjectPayloadSchema>

// ─── Lista canônica de 40 tickers ────────────────────────────────────────────

/** Lista canônica dos 40 tickers — importada de lib/constants/tickers.ts */
let CANONICAL_TICKERS: string[]
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TICKERS_40 } = require('@/lib/constants/tickers')
  CANONICAL_TICKERS = Array.from(TICKERS_40)
} catch {
  // Fallback: tickers canônicos ficcionais do INTAKE (40 ativos)
  // TODO: substituir quando lib/constants/tickers.ts estiver disponível
  CANONICAL_TICKERS = [
    'URU3', 'POR4', 'TIM3', 'TRI4', 'GAL3',
    'FOG3', 'COL3', 'IMO3', 'RAP3', 'MAL4',
    'TRI3', 'GUE4', 'TOR3', 'LEM3', 'BAL4',
    'FUR3', 'VOA4', 'CON3', 'LEA3', 'LEB3',
    'COE3', 'CAV4', 'DRA3', 'LEI4', 'PAN3',
    'VOZ3', 'GAP3', 'TIG4', 'DOU4', 'LEP4',
    'PER3', 'IND4', 'TUB3', 'NAF3', 'TIV3',
    'FAS3', 'MAC4', 'ABT4', 'LEI3', 'TIS3',
  ]
}

export { CANONICAL_TICKERS }

// ─── Assertion helpers ───────────────────────────────────────────────────────

/**
 * Valida payload contra schema Zod e lança erro descritivo com detalhes de
 * cada campo inválido se a validação falhar.
 */
export function assertContractShape<T>(
  schema: z.ZodSchema<T>,
  payload: unknown,
  contractName: string,
): T {
  const result = schema.safeParse(payload)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Contrato "${contractName}" violado:\n${issues}`)
  }
  return result.data
}

/**
 * Verifica que um tick Redis foi publicado dentro do SLA de frequência.
 * @param timestamps Array de timestamps (ms) de ticks recebidos
 * @param maxIntervalMs SLA máximo entre ticks consecutivos
 * @param tickerSymbol Ticker para mensagem de erro descritiva
 */
export function assertTickFrequencySLA(
  timestamps: number[],
  maxIntervalMs: number,
  tickerSymbol: string,
): void {
  if (timestamps.length < 2) {
    throw new Error(
      `assertTickFrequencySLA: necessário >= 2 ticks para ${tickerSymbol}, recebido ${timestamps.length}`,
    )
  }
  for (let i = 1; i < timestamps.length; i++) {
    const interval = timestamps[i]! - timestamps[i - 1]!
    if (interval > maxIntervalMs) {
      throw new Error(
        `SLA violado para ${tickerSymbol}: intervalo ${interval}ms > ${maxIntervalMs}ms (ticks ${i - 1}→${i})`,
      )
    }
  }
}

// ─── Factories ───────────────────────────────────────────────────────────────

/**
 * Cria mock de payload Redis para testes de contrato de market:tick.
 */
export function makeMarketTickPayload(
  overrides: Partial<MarketTick> = {},
): MarketTick {
  const bid = 38.48
  const ask = 38.52
  return {
    ticker: 'URU3',
    price: 38.5,
    change24h: 1.2,
    volume: 1_500_000,
    bid,
    ask,
    spread: parseFloat((ask - bid).toFixed(10)),
    sentiment: 'POSITIVO',
    timestamp: Date.now(),
    ...overrides,
  }
}

/**
 * Cria mock de payload para testes de contrato de news:inject.
 */
export function makeNewsInjectPayload(
  overrides: Partial<NewsInjectPayload> = {},
): NewsInjectPayload {
  return {
    title: 'Urubu da Gavea FC anuncia novo patrocinador master',
    ticker: 'URU3',
    impactCategory: 'FINANCEIRA_CRITICA',
    sentiment: 0.8,
    source: 'Globo Esporte',
    publishedAt: new Date().toISOString(),
    ...overrides,
  }
}
