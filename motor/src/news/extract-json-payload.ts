// ============================================================================
// FootStock Motor — extract-json-payload
// Extrai o objeto JSON de classificação de uma resposta crua de LLM.
//
// Motivo: o contrato do classificador pede "Responda SOMENTE com JSON", mas
// nenhum provider garante isso. Em 2026-07-30, quando o formato pedido virou
// aninhado (`{"teams":[...]}`), o Sonnet passou a embrulhar a resposta em code
// fence markdown em ~83% das chamadas e a escrever preâmbulo em prosa nos
// outros ~17%. Como o classificador fazia `JSON.parse` no texto cru, TODAS as
// notícias caíam em `parse_invalid` -> modo degradado do gate editorial ->
// NEUTRAL/INSTITUCIONAL sem despacho de impacto de preço.
//
// A extração é provider-agnóstica de propósito: Anthropic e Kimi erram de
// formas diferentes e o classificador não deve saber qual está ativo.
// Espelha `footstock-next/src/lib/services/AIResponseParser.ts`, com duas
// blindagens a mais: gate de shape e recusa por ambiguidade (ver abaixo).
// ============================================================================

/** Blocos markdown ```json ... ``` (ou ``` ... ``` sem linguagem), todos. */
const MARKDOWN_FENCE_RE = /```(?:[a-zA-Z]+)?[ \t]*\r?\n?([\s\S]*?)```/g

/**
 * Como o JSON foi encontrado. Vai para a telemetria: `raw` é o caminho feliz,
 * qualquer outro valor é o modelo desobedecendo o prompt e merece ser contado.
 */
export type JsonExtractionStrategy = 'raw' | 'fenced' | 'embedded'

export interface JsonExtraction {
  /** Texto pronto para `JSON.parse` — já validado como objeto do contrato. */
  json: string
  strategy: JsonExtractionStrategy
}

/**
 * Parseia o candidato e aceita apenas objeto JSON de topo. Array e primitivo
 * são recusados porque o contrato do classificador é um objeto.
 */
function parseObject(candidate: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(candidate)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // candidato inválido; quem chama tenta o próximo
  }
  return null
}

/**
 * O objeto tem cara de classificação de notícia?
 *
 * Exige um campo de NOTÍCIA (`impactCategory`/`relevance`) E um campo de TIME
 * (`teams`/`ticker`). Sem esse gate, uma resposta truncada no meio faria a
 * varredura balanceada devolver o primeiro item de `teams` —
 * `{"ticker":"REG3","sentiment":-0.3,"confidence":0.9}` — que parseia sem erro
 * e viraria uma classificação mono-time silenciosamente inventada, pior do que
 * cair no fallback determinístico. Um item de `teams` nunca traz campo de
 * notícia, então o gate o rejeita.
 *
 * Chave desconhecida a mais NÃO reprova (ex: o modelo anexar `"analysis"`):
 * `collectTeamCandidates` já ignora campo que não conhece, e reprovar por isso
 * jogaria fora classificação boa por motivo cosmético.
 */
function looksLikeClassification(value: Record<string, unknown>): boolean {
  const hasNewsField = 'impactCategory' in value || 'relevance' in value
  const hasTeamField = 'teams' in value || 'ticker' in value
  return hasNewsField && hasTeamField
}

/**
 * Todos os objetos de chaves BALANCEADAS do texto, na ordem de abertura.
 *
 * Balanceamento em vez do regex guloso `/(\{[\s\S]*\})/` do AIResponseParser
 * porque o guloso vai do primeiro `{` ao último `}` do texto inteiro: um
 * preâmbulo em prosa que contenha `{` faz o recorte pegar lixo. O scanner
 * respeita string literal e escape, então `}` dentro de `"..."` não fecha
 * objeto.
 */
function scanBalancedObjects(text: string): string[] {
  const found: string[] = []

  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i++) {
      const ch = text[i]

      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }

      if (ch === '"') inString = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          found.push(text.slice(start, i + 1))
          break
        }
      }
    }
  }

  return found
}

/**
 * Extrai o objeto JSON de classificação da resposta do LLM, ou `null`.
 *
 * `null` é resposta legítima e significa "não deu para confiar no que voltou" —
 * quem chama deve tratar como `parse_invalid`, nunca inventar payload vazio.
 *
 * Estratégias, em ordem de custo:
 *  1. `raw`      — o texto inteiro já é o objeto (caminho feliz)
 *  2. `fenced`   — objeto dentro de bloco markdown ```json ... ```
 *  3. `embedded` — objeto balanceado no meio de prosa
 *
 * Candidatos que não passam no gate de shape são descartados. Se sobrar MAIS DE
 * UM objeto de classificação distinto (rascunho seguido de versão final, duas
 * fences alternativas), a resposta é ambígua e devolvemos `null`: escolher por
 * heurística de posição arriscaria publicar o rascunho como veredito. Degradar
 * é o comportamento correto quando o modelo não deu uma resposta só.
 */
export function extractJsonPayload(raw: string): JsonExtraction | null {
  if (typeof raw !== 'string') return null

  // BOM antes do `{` quebra o JSON.parse direto e não é aparado por trim().
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) return null

  const candidates: JsonExtraction[] = []
  const seen = new Set<string>()

  const consider = (candidate: string, strategy: JsonExtractionStrategy): void => {
    const parsed = parseObject(candidate)
    if (!parsed || !looksLikeClassification(parsed)) return

    // Dedup por forma canônica: o mesmo objeto costuma ser achado por mais de
    // uma estratégia (texto puro também é achado pelo scanner) e isso não é
    // ambiguidade. A primeira estratégia que o encontrou é a reportada.
    const key = JSON.stringify(parsed)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ json: candidate, strategy })
  }

  consider(text, 'raw')

  for (const match of text.matchAll(MARKDOWN_FENCE_RE)) {
    consider(match[1].trim(), 'fenced')
  }

  for (const objeto of scanBalancedObjects(text)) {
    consider(objeto, 'embedded')
  }

  return candidates.length === 1 ? candidates[0] : null
}
