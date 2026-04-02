// ============================================================================
// Foot Stock — AIResponseParser Tests (module-21/TASK-2/ST002)
// Cobre: 3 estratégias de extração + fallback genérico + isFallback()
// ============================================================================

import { AIResponseParser } from './AIResponseParser'
import type { AIAnalysis } from '@/lib/types/ai'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_PAYLOAD = {
  resumo: 'Análise fundamentalista do clube. Perspectivas favoráveis no médio prazo.',
  pontos_positivos: ['Elenco jovem', 'Torcida fiel'],
  pontos_negativos: ['Dívida alta', 'Resultado instável'],
  sentimento: 0.3,
  recomendacao: 'COMPRAR' as const,
  risco: 'MEDIO' as const,
  noticias_relevantes: ['Clube anuncia novo patrocinador'],
}

const TICKER = 'FLAM3'

function makeParser() {
  return new AIResponseParser()
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AIResponseParser.parse — estratégia 1: JSON puro', () => {
  it('JSON válido direto → AIAnalysis correto, isFallback=false', () => {
    const parser = makeParser()
    const raw = JSON.stringify(VALID_PAYLOAD)

    const result = parser.parse(raw, TICKER)

    expect(result.ticker).toBe(TICKER)
    expect(result.resumo).toBe(VALID_PAYLOAD.resumo)
    expect(result.pontos_positivos).toEqual(VALID_PAYLOAD.pontos_positivos)
    expect(result.pontos_negativos).toEqual(VALID_PAYLOAD.pontos_negativos)
    expect(result.sentimento).toBe(VALID_PAYLOAD.sentimento)
    expect(result.recomendacao).toBe('COMPRAR')
    expect(result.risco).toBe('MEDIO')
    expect(result.noticias_relevantes).toEqual(VALID_PAYLOAD.noticias_relevantes)
    expect(result.cached).toBe(false)
    expect(result.isWebSearched).toBe(false)
    expect(parser.isFallback(result)).toBe(false)
  })

  it('JSON com campos extras → ignorados, parse ok, isFallback=false', () => {
    const parser = makeParser()
    const payloadWithExtra = {
      ...VALID_PAYLOAD,
      campoExtra: 'ignorar',
      outroExtra: 42,
    }
    const raw = JSON.stringify(payloadWithExtra)

    const result = parser.parse(raw, TICKER)

    expect(parser.isFallback(result)).toBe(false)
    expect(result.recomendacao).toBe('COMPRAR')
    // Campo extra não deve existir na saída
    expect((result as unknown as Record<string, unknown>).campoExtra).toBeUndefined()
  })
})

describe('AIResponseParser.parse — estratégia 2: bloco markdown', () => {
  it('JSON com wrapping markdown ```json ... ``` → extraído, isFallback=false', () => {
    const parser = makeParser()
    const raw = `Aqui está a análise:\n\`\`\`json\n${JSON.stringify(VALID_PAYLOAD)}\n\`\`\``

    const result = parser.parse(raw, TICKER)

    expect(result.ticker).toBe(TICKER)
    expect(result.recomendacao).toBe('COMPRAR')
    expect(parser.isFallback(result)).toBe(false)
  })

  it('JSON com wrapping markdown ``` (sem "json") → extraído, isFallback=false', () => {
    const parser = makeParser()
    const raw = `\`\`\`\n${JSON.stringify(VALID_PAYLOAD)}\n\`\`\``

    const result = parser.parse(raw, TICKER)

    expect(parser.isFallback(result)).toBe(false)
    expect(result.risco).toBe('MEDIO')
  })
})

describe('AIResponseParser.parse — estratégia 3: bloco { } em texto livre', () => {
  it('JSON precedido de texto → estratégia 3 extrai, isFallback=false', () => {
    const parser = makeParser()
    const raw = `Aqui vai minha resposta detalhada sobre o clube:\n\nConsiderando os dados fornecidos, ${JSON.stringify(VALID_PAYLOAD)}\n\nEspero que ajude.`

    const result = parser.parse(raw, TICKER)

    expect(parser.isFallback(result)).toBe(false)
    expect(result.sentimento).toBe(0.3)
  })
})

describe('AIResponseParser.parse — estratégia 4: fallback genérico', () => {
  it('string sem JSON → retorna fallback genérico', () => {
    const parser = makeParser()
    const raw = 'Não tenho informações suficientes para esta análise no momento.'

    const result = parser.parse(raw, TICKER)

    expect(result.ticker).toBe(TICKER)
    expect(parser.isFallback(result)).toBe(true)
    expect(result.recomendacao).toBe('MANTER')
    expect(result.risco).toBe('MEDIO')
    expect(result.sentimento).toBe(0)
    expect(result.cached).toBe(false)
    expect(result.isWebSearched).toBe(false)
  })

  it('JSON com campo risco inválido → validação Zod falha → fallback', () => {
    const parser = makeParser()
    const invalid = {
      ...VALID_PAYLOAD,
      risco: 'MUITO_ALTO', // não é um valor válido (ALTO|MEDIO|BAIXO)
    }
    const raw = JSON.stringify(invalid)

    const result = parser.parse(raw, TICKER)

    expect(parser.isFallback(result)).toBe(true)
  })

  it('JSON com campo recomendacao inválido → fallback', () => {
    const parser = makeParser()
    const invalid = {
      ...VALID_PAYLOAD,
      recomendacao: 'AGUARDAR', // não é COMPRAR|MANTER|VENDER
    }
    const raw = JSON.stringify(invalid)

    const result = parser.parse(raw, TICKER)

    expect(parser.isFallback(result)).toBe(true)
  })

  it('string vazia → fallback', () => {
    const parser = makeParser()
    const result = parser.parse('', TICKER)
    expect(parser.isFallback(result)).toBe(true)
  })
})

describe('AIResponseParser.isFallback', () => {
  it('análise real → isFallback=false', () => {
    const parser = makeParser()
    const analysis: AIAnalysis = {
      ticker: TICKER,
      resumo: 'Análise completa do ativo com dados atualizados.',
      pontos_positivos: ['Crescimento estável'],
      pontos_negativos: ['Volatilidade alta'],
      sentimento: 0.1,
      recomendacao: 'MANTER',
      risco: 'BAIXO',
      noticias_relevantes: [],
      generatedAt: new Date().toISOString(),
      isWebSearched: false,
      cached: false,
    }

    expect(parser.isFallback(analysis)).toBe(false)
  })

  it('análise com pontos_positivos[0] = "Dados insuficientes" → isFallback=true', () => {
    const parser = makeParser()
    const fallbackAnalysis: AIAnalysis = {
      ticker: TICKER,
      resumo: 'Outro resumo qualquer.',
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

    expect(parser.isFallback(fallbackAnalysis)).toBe(true)
  })
})
