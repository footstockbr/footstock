// ============================================================================
// FootStock Motor — NewsSentimentWindow
// Consulta de janela de notícias para o componente A (janela de sentimento).
//
// Task-007 do loop 08-17-foot-stock-sentimento-vivo-motor-ativos:
// findMany sobre `news` filtrando is_published = true E
// sentiment_classified_at IS NOT NULL, janela fixa de 72h, peso uniforme.
// Política mais estrita que o gate editorial: exclui notícia bloqueada E
// notícia publicada em modo degradado (sentimento por heurística, sem LLM).
//
// Este módulo exporta:
//   1. `fetchNewsWindow()` — adapter Prisma (I/O).
//   2. `computeWindowComponent()` — função PURA de cálculo do componente A
//      a partir de uma lista de notícias da janela (testável sem DB).
//   3. `buildWindowExitReason()` — razão textual para saída de notícia da janela.
// ============================================================================

import type { PrismaClient } from '@prisma/client'

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Janela fixa de consulta: 72 horas. */
export const NEWS_WINDOW_HOURS = 72

/** Janela em milissegundos. */
export const NEWS_WINDOW_MS = NEWS_WINDOW_HOURS * 60 * 60 * 1000

/**
 * Constante de confiança C da normalização do componente A.
 *
 * Task-007: a forma canônica fixada é `N = soma / (massa + C)`, com `C = 3.0`,
 * conforme a seção 10.1 do `source.md` (fórmula v2: média dos sinais vezes
 * fator de confiança, que se reduz algebricamente a `soma / (massa + C)`).
 * A decisão E.7.2 substitui apenas a janela e a ponderação: janela fixa de 72h
 * e peso uniforme, ou seja `peso_i = 1.0` e `massa` igual à contagem de
 * notícias classificadas da janela.
 *
 * O denominador NÃO cresce com o volume além de `massa`, então nenhum ativo
 * satura |N| = 1: com 40 notícias unânimes o valor é 40/43 = 0.93, e com 3 é
 * 3/6 = 0.50. Isso é o que iguala a magnitude típica entre Série A e Série B
 * (mediana de |N| 0.289 contra 0.315 na simulação de 7 dias do `source.md`),
 * eliminando a assimetria de cobertura de 5.5x medida na hipótese 1.
 *
 * Task-021 é quem mede a proporção real de cobertura e calibra este valor.
 */
export const NORMALIZATION_CONFIDENCE_C = 3.0

/**
 * Task-021: Limiar de baixa cobertura do componente A.
 * Quando a proporção de notícias não-classificadas (sentiment_classified_at = NULL)
 * em relação ao total publicado na janela ULTRAPASSAR este valor, o componente A
 * sinaliza baixa cobertura (lowCoverage = true) e retorna value = 0.
 * O limite é ESTRITO: `coverageRatio < (1 - LOW_COVERAGE_THRESHOLD)`. Exatamente
 * 50/50 (metade classificada) NÃO dispara lowCoverage, alinhado ao criterio 6(a)
 * da task-021 ("cobertura alta (>= 50%) -> lowCoverage = false").
 *
 * Valor 0.50 = mais de 50% das notícias publicadas na janela ainda sem classificação LLM.
 * Nesse cenário, o componente A não contribui para o score (dados insuficientes),
 * e a razão textual diferencia "janela quase vazia por baixa cobertura" de
 * "janela equilibrada / sem sinal dominante".
 */
export const LOW_COVERAGE_THRESHOLD = 0.50

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Sentimento da notícia como string (espelho do enum Prisma). */
export type NewsSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

/** Linha mínima retornada pela consulta de janela. */
export interface NewsWindowRow {
  id: string
  ticker: string | null
  sentiment: NewsSentiment
  publishedAt: Date
  sentimentClassifiedAt: Date
}

/** Resultado da consulta de janela. */
export interface NewsWindowResult {
  /** Notícias dentro da janela, ordenadas por publishedAt DESC. */
  rows: NewsWindowRow[]
  /** Início da janela (cutoff). */
  windowStart: Date
  /** Fim da janela (agora). */
  windowEnd: Date
  /** Contagem total de notícias na janela. */
  count: number
}

/** Resultado do cálculo do componente A (janela de notícias). */
export interface WindowComponentResult {
  /** Valor normalizado do componente A em [-1, +1]. 0 quando lowCoverage = true. */
  value: number
  /** Contagem de notícias na janela (classificadas). */
  count: number
  /** Contagem de notícias positivas. */
  positiveCount: number
  /** Contagem de notícias negativas. */
  negativeCount: number
  /** Contagem de notícias neutras. */
  neutralCount: number
  /** Task-021: true quando MAIS de LOW_COVERAGE_THRESHOLD das publicadas não foram classificadas (limite estrito). */
  lowCoverage: boolean
  /** Task-021: contagem de notícias publicadas na janela sem classificação LLM. */
  unclassifiedCount: number
}

/** Task-021: Estatísticas de cobertura da janela de notícias. */
export interface CoverageStats {
  /** Total de notícias publicadas na janela (classificadas + não-classificadas). */
  totalPublished: number
  /** Notícias com classificação LLM completa. */
  classifiedCount: number
  /** Notícias publicadas com sentiment_classified_at = NULL. */
  unclassifiedCount: number
  /** Proporção de notícias classificadas em relação ao total (0 a 1). */
  coverageRatio: number
  /** true quando coverageRatio < (1 - LOW_COVERAGE_THRESHOLD), i.e. MAIS de 50% não-classificadas (50/50 exato = false). */
  isLowCoverage: boolean
}

// ─── Adapter Prisma ──────────────────────────────────────────────────────────

/**
 * Busca notícias da janela de 72h para o cálculo do componente A.
 *
 * Filtros aplicados:
 *   - `isPublished = true` (notícia visível no feed)
 *   - `sentimentClassifiedAt IS NOT NULL` (sentimento classificado)
 *   - `sentimentDegraded = false` (classificação LLM, não heurística)
 *   - `publishedAt >= now - 72h` (janela temporal)
 *
 * A política é deliberadamente mais estrita que o gate editorial:
 *   - Notícia bloqueada (`isPublished = false`) fica de fora.
 *   - Notícia degradada (`sentimentDegraded = true`) fica de fora.
 */
export async function fetchNewsWindow(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<NewsWindowResult> {
  const windowStart = new Date(now.getTime() - NEWS_WINDOW_MS)

  const rows = await prisma.news.findMany({
    where: {
      isPublished: true,
      sentimentClassifiedAt: { not: null },
      sentimentDegraded: false,
      publishedAt: { gte: windowStart },
    },
    select: {
      id: true,
      ticker: true,
      sentiment: true,
      publishedAt: true,
      sentimentClassifiedAt: true,
    },
    orderBy: { publishedAt: 'desc' },
  })

  return {
    rows: rows
      .filter((r) => r.publishedAt !== null)
      .map((r) => ({
        id: r.id,
        ticker: r.ticker,
        sentiment: r.sentiment as NewsSentiment,
        publishedAt: r.publishedAt!,
        sentimentClassifiedAt: r.sentimentClassifiedAt!,
      })),
    windowStart,
    windowEnd: now,
    count: rows.filter((r) => r.publishedAt !== null).length,
  }
}

// ─── Task-021: Consulta de cobertura (notícias não-classificadas) ────────────

/**
 * Task-021 (ST005): MEDIÇÃO REAL DE COBERTURA — executada em 2026-08-18T18:18Z
 * contra o banco de PRODUÇÃO (Railway Postgres, via TCP proxy), somente leitura.
 *
 * Query executada (equivalente a fetchUnclassifiedCount + total publicado):
 *   SELECT COUNT(*) FILTER (WHERE is_published
 *            AND published_at >= NOW() - INTERVAL '72 hours')                       AS pub_72h,
 *          COUNT(*) FILTER (WHERE is_published
 *            AND published_at >= NOW() - INTERVAL '72 hours'
 *            AND sentiment_classified_at IS NULL)                                   AS nao_class_72h
 *   FROM news;
 *
 * Resultado (produção, 2026-08-18T18:18Z):
 *   - janela 72h : 343 publicadas /   0 não-classificadas -> coverageRatio = 1.00
 *   - janela  7d : 811 publicadas /   0 não-classificadas -> coverageRatio = 1.00
 *   - janela 30d: 3208 publicadas /   0 não-classificadas -> coverageRatio = 1.00
 *   - histórico : 6262 publicadas /   0 não-classificadas -> coverageRatio = 1.00
 *
 * Leitura do número: a proporção medida de não-classificadas é 0% — MUITO abaixo
 * do LOW_COVERAGE_THRESHOLD de 50%. Hoje o pipeline de publicação só marca
 * isPublished = true depois de classificar (sentimentClassifiedAt preenchido),
 * então em regime normal `lowCoverage` NUNCA dispara. O tratamento de ST001-ST004
 * permanece como GUARDA para o modo degradado (LLM fora do ar, backlog de
 * classificação, backfill de notícias antigas), não como caminho quente.
 *
 * Consequência de calibração: NÃO reduzir LOW_COVERAGE_THRESHOLD com base nesta
 * medição. O valor 0.50 só é observável quando o classificador falha; medir
 * de novo (mesma query) antes de qualquer ajuste do limiar.
 *
 * Ressalva metodológica: `news.published_at` é `timestamp without time zone`,
 * então a comparação com NOW() usa o fuso da sessão. Como a contagem de
 * não-classificadas é 0 em todas as janelas testadas (72h, 7d, 30d, total), o
 * resultado é insensível a esse deslocamento.
 */

/**
 * Task-021 (ST001): Conta notícias publicadas nas últimas 72h com
 * sentiment_classified_at = NULL (classificação LLM pendente).
 *
 * Consulta SOMENTE LEITURA (prisma.news.count). Mesma janela temporal de
 * fetchNewsWindow (72h), mas filtra APENAS isPublished + publishedAt +
 * sentimentClassifiedAt IS NULL. Não exclui sentimentDegraded porque a
 * notícia não-classificada ainda não passou pelo classificador.
 */
export async function fetchUnclassifiedCount(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const windowStart = new Date(now.getTime() - NEWS_WINDOW_MS)

  return prisma.news.count({
    where: {
      isPublished: true,
      publishedAt: { gte: windowStart },
      sentimentClassifiedAt: null,
    },
  })
}

/**
 * Task-021 (ST002): Função PURA de estatísticas de cobertura.
 * Recebe contagens de notícias classificadas e não-classificadas e retorna
 * estatísticas completas de cobertura da janela.
 *
 * Cenários:
 *   - 10 classificadas / 2 não = coverageRatio 0.83 (ok)
 *   - 3 classificadas / 7 não = coverageRatio 0.30 (baixa)
 *   - 0 classificadas / 5 não = coverageRatio 0 (baixa extrema)
 *   - 0 classificadas / 0 não = coverageRatio 1 (ausência, não baixa cobertura)
 */
export function computeCoverageStats(
  classifiedCount: number,
  unclassifiedCount: number,
): CoverageStats {
  const totalPublished = classifiedCount + unclassifiedCount

  if (totalPublished === 0) {
    return {
      totalPublished: 0,
      classifiedCount: 0,
      unclassifiedCount: 0,
      coverageRatio: 1,
      isLowCoverage: false,
    }
  }

  const coverageRatio = classifiedCount / totalPublished
  const isLowCoverage = coverageRatio < (1 - LOW_COVERAGE_THRESHOLD)

  return {
    totalPublished,
    classifiedCount,
    unclassifiedCount,
    coverageRatio,
    isLowCoverage,
  }
}

// ─── Função PURA de cálculo do componente A ──────────────────────────────────

/**
 * Calcula o valor do componente A (janela de notícias) a partir de uma lista
 * de notícias. Função PURA — sem I/O, testável sem DB.
 *
 * Fórmula canônica (task-007, `source.md` 10.1):
 *   soma  = positiveCount - negativeCount   (peso uniforme 1.0 por notícia)
 *   massa = count                            (notícias classificadas da janela)
 *   N     = soma / (massa + NORMALIZATION_CONFIDENCE_C)
 *   clamped to [-1, +1] (defensivo; a forma já é limitada por construção)
 *
 * O somatório do numerador cresce com o volume, mas o denominador cresce junto,
 * então |N| < 1 para qualquer massa finita e a divisão nunca satura:
 *   - Série A com 15 notícias unânimes: 15/18 = 0.83.
 *   - Série B com 3 notícias unânimes: 3/6 = 0.50.
 *   - A razão entre as duas é 1.7x, não a assimetria de cobertura de 5.5x.
 *
 * Janela vazia: massa = 0 devolve 0/3 = 0 sem divisão por zero.
 *
 * O mapeamento de sentimento é:
 *   - BULLISH -> +1
 *   - BEARISH -> -1
 *   - NEUTRAL -> 0
 */
export function computeWindowComponent(
  rows: NewsWindowRow[],
  unclassifiedCount = 0,
): WindowComponentResult {
  let positiveCount = 0
  let negativeCount = 0
  let neutralCount = 0

  for (const row of rows) {
    switch (row.sentiment) {
      case 'BULLISH':
        positiveCount++
        break
      case 'BEARISH':
        negativeCount++
        break
      case 'NEUTRAL':
        neutralCount++
        break
    }
  }

  const classifiedCount = rows.length

  // Task-021 (ST003): avaliar cobertura antes de calcular o valor.
  // Zero notícias classificadas + zero não-classificadas = ausência (não baixa cobertura).
  // Zero notícias classificadas + notícias não-classificadas presentes = baixa cobertura.
  const coverage = computeCoverageStats(classifiedCount, unclassifiedCount)
  const lowCoverage = coverage.isLowCoverage

  if (classifiedCount === 0 && unclassifiedCount === 0) {
    return {
      value: 0,
      count: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      lowCoverage: false,
      unclassifiedCount: 0,
    }
  }

  // Task-021 (ST003): quando lowCoverage = true, value = 0 (não contribui para o score).
  if (lowCoverage) {
    return {
      value: 0,
      count: classifiedCount,
      positiveCount,
      negativeCount,
      neutralCount,
      lowCoverage: true,
      unclassifiedCount,
    }
  }

  // Forma canônica: soma dos sinais (peso uniforme 1.0) sobre massa + C.
  // O denominador nunca é zero porque C > 0, então janela vazia devolve 0.
  const soma = positiveCount - negativeCount
  const massa = classifiedCount
  const normalizedValue = soma / (massa + NORMALIZATION_CONFIDENCE_C)

  // Clamp defensivo: a forma acima já é limitada a (-1, +1) por construção.
  const value = Math.max(-1, Math.min(1, normalizedValue))

  return {
    value,
    count: classifiedCount,
    positiveCount,
    negativeCount,
    neutralCount,
    lowCoverage: false,
    unclassifiedCount,
  }
}

// ─── Razão textual para saída de notícia da janela ───────────────────────────

/**
 * Constrói a razão textual para o caso em que o score do componente A se move
 * SEM evento novo, apenas porque uma notícia saiu da janela de 72h.
 *
 * Exemplo: "janela-noticias: 1 notícia BEARISH saiu da janela (72h), score moveu de +0.15 para +0.20"
 */
export function buildWindowExitReason(params: {
  exitedNewsCount: number
  exitedNewsSentiments: NewsSentiment[]
  previousScore: number
  currentScore: number
}): string {
  const { exitedNewsCount, exitedNewsSentiments, previousScore, currentScore } = params

  if (exitedNewsCount === 0) return ''

  const sentimentCounts: Record<NewsSentiment, number> = { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 }
  for (const s of exitedNewsSentiments) {
    sentimentCounts[s]++
  }

  const parts: string[] = []
  if (sentimentCounts.BULLISH > 0) parts.push(`${sentimentCounts.BULLISH} BULLISH`)
  if (sentimentCounts.BEARISH > 0) parts.push(`${sentimentCounts.BEARISH} BEARISH`)
  if (sentimentCounts.NEUTRAL > 0) parts.push(`${sentimentCounts.NEUTRAL} NEUTRAL`)

  const sentimentStr = parts.join(', ')
  const prevStr = previousScore >= 0 ? `+${previousScore.toFixed(2)}` : previousScore.toFixed(2)
  const currStr = currentScore >= 0 ? `+${currentScore.toFixed(2)}` : currentScore.toFixed(2)

  return `janela-noticias: ${exitedNewsCount} notícia(s) saíram da janela (72h) [${sentimentStr}], score moveu de ${prevStr} para ${currStr}`
}
