// ============================================================================
// Foot Stock — AIResponseParser (module-21/TASK-2/ST002)
// Parser robusto de resposta da IA com 3 estratégias de extração + fallback
// ============================================================================

import { AIAnalysisSchema, type AIAnalysis } from '@/lib/types/ai'

// Regex para extrair JSON de blocos markdown ```json ... ```
// Greedy match para capturar o JSON completo (inclui } internos de arrays/objetos)
const MARKDOWN_JSON_RE = /```(?:json)?\s*(\{[\s\S]*\})\s*```/

// Regex para encontrar qualquer bloco { ... } na resposta
const RAW_JSON_BLOCK_RE = /(\{[\s\S]*\})/

export class AIResponseParser {
  /**
   * Remove tags <cite> e </cite> do web_search que poluem o JSON.
   * Ex: <cite index="26-2">texto</cite> → texto
   */
  private _stripCitations(text: string): string {
    return text.replace(/<\/?cite[^>]*>/g, '')
  }

  /**
   * Tenta parsear a resposta do Claude em AIAnalysis.
   * Nunca propaga exceção — sempre retorna um AIAnalysis (real ou fallback).
   *
   * Estratégias (em ordem):
   *  1. JSON.parse direto + validação Zod
   *  2. Extração de bloco markdown ```json ... ```
   *  3. Primeiro bloco { ... } encontrado no texto
   *  4. Fallback genérico
   */
  parse(rawResponse: string, ticker: string): AIAnalysis {
    // Pré-processamento: remover tags <cite> do web_search
    const cleanResponse = this._stripCitations(rawResponse)
    // Estratégia 1: JSON puro direto
    try {
      const parsed = JSON.parse(cleanResponse)
      const result = AIAnalysisSchema.safeParse(parsed)
      if (result.success) return this._toAIAnalysis(result.data, ticker, false)
    } catch {
      // continua para próxima estratégia
    }

    // Estratégia 2: extrair de bloco markdown
    const markdownMatch = cleanResponse.match(MARKDOWN_JSON_RE)
    if (markdownMatch?.[1]) {
      try {
        const parsed = JSON.parse(markdownMatch[1])
        const result = AIAnalysisSchema.safeParse(parsed)
        if (result.success) return this._toAIAnalysis(result.data, ticker, false)
      } catch {
        // continua
      }
    }

    // Estratégia 3: qualquer bloco { ... } no texto
    const rawMatch = cleanResponse.match(RAW_JSON_BLOCK_RE)
    if (rawMatch?.[1]) {
      try {
        const parsed = JSON.parse(rawMatch[1])
        const result = AIAnalysisSchema.safeParse(parsed)
        if (result.success) return this._toAIAnalysis(result.data, ticker, false)
      } catch {
        // continua
      }
    }

    // Estratégia 4: fallback genérico
    console.error(
      '[AIResponseParser] Todas as estratégias falharam. Resposta (200 chars):',
      cleanResponse.slice(0, 200)
    )
    return this._fallback(ticker)
  }

  /**
   * Verifica se uma análise é o fallback genérico.
   * A UI pode exibir aviso discreto quando isFallback() === true.
   */
  isFallback(analysis: AIAnalysis): boolean {
    return (
      analysis.resumo.startsWith('Não foi possível gerar') ||
      analysis.pontos_positivos[0] === 'Dados insuficientes'
    )
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private _toAIAnalysis(
    raw: { resumo: string; pontos_positivos: string[]; pontos_negativos: string[]; sentimento: number; recomendacao: string; risco: string; noticias_relevantes: string[] },
    ticker: string,
    cached: boolean,
    isWebSearched = false
  ): AIAnalysis {
    return {
      ticker,
      resumo: raw.resumo,
      pontos_positivos: raw.pontos_positivos,
      pontos_negativos: raw.pontos_negativos,
      sentimento: raw.sentimento,
      recomendacao: raw.recomendacao as AIAnalysis['recomendacao'],
      risco: raw.risco as AIAnalysis['risco'],
      noticias_relevantes: raw.noticias_relevantes,
      generatedAt: new Date().toISOString(),
      isWebSearched,
      cached,
    }
  }

  private _fallback(ticker: string): AIAnalysis {
    return {
      ticker,
      resumo: 'Não foi possível gerar uma análise completa no momento. Tente novamente.',
      pontos_positivos: ['Dados insuficientes'],
      pontos_negativos: ['Análise temporariamente indisponível'],
      sentimento: 0,
      recomendacao: 'MANTER',
      risco: 'MEDIO',
      noticias_relevantes: [],
      generatedAt: new Date().toISOString(),
      isWebSearched: false,
      cached: false,
    }
  }
}

export const aiResponseParser = new AIResponseParser()
