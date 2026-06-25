// ============================================================================
// FootStock — NewsSentimentClassifier (item 15)
// Classifica o sentimento de uma noticia de futebol via LLM (Anthropic), reusando a mesma
// infraestrutura de IA do Assessor IA (ANTHROPIC_API_KEY). Substitui o default NEUTRAL dos
// feeds RSS por um sentimento que entende o CONTEXTO da manchete (a heuristica por palavra-chave
// errava: "vence e sai da zona de rebaixamento" virava negativo). news.sentiment alimenta a UI
// e o Assessor IA — NAO o motor de precos.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages/messages'
import { aiClientOptions, hasAIKey, resolveModel } from '@/lib/services/ai-provider'

export type NewsSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

// Sentimento e tarefa simples -> modelo barato/rapido. Override via env (ex.: claude-sonnet-4-5).
// Resolvido pelo provider ativo (AI_PROVIDER): no Kimi mapeia para kimi-for-coding/KIMI_MODEL.
const MODEL = resolveModel(process.env.NEWS_SENTIMENT_MODEL ?? 'claude-haiku-4-5-20251001')

const SYSTEM_PROMPT = `Voce classifica o SENTIMENTO de uma noticia de futebol brasileiro para um app que simula uma "bolsa de valores" de clubes. O sentimento reflete se a noticia tende a VALORIZAR ou DESVALORIZAR o(s) clube(s) citado(s).

Responda com EXATAMENTE uma palavra, sem pontuacao nem explicacao:
- BULLISH: boa para o valor do clube (vitoria, titulo, classificacao, contratacao/reforco, renovacao, volta de lesao, boa fase, assumir lideranca).
- BEARISH: ruim (derrota, eliminacao, lesao seria, crise, demissao, rebaixamento, saida de jogador importante, expulsao decisiva, ma fase).
- NEUTRAL: rumor de mercado nao confirmado, previa/escalacao, opiniao/analise sem fato novo, empate sem peso, ou nada claramente positivo nem negativo. Na duvida, NEUTRAL.

Considere a manchete INTEIRA (ex.: "vence e sai da zona de rebaixamento" e BULLISH, nao BEARISH).`

function getAnthropic(): Anthropic {
  return new Anthropic(aiClientOptions())
}

// Circuit-breaker de credito esgotado (mesma classe do motor): quando a Anthropic
// responde "credit balance is too low", pular as proximas chamadas por um cooldown
// em vez de floodar 1 erro por noticia ate a recarga. 0 = fechado.
const CREDIT_EXHAUSTED_COOLDOWN_MS = 10 * 60 * 1000
let creditCircuitOpenUntil = 0

function isCreditExhaustedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return /credit balance|insufficient (funds|credits?)|billing/i.test(msg)
}

function parseSentiment(raw: string): NewsSentiment | null {
  const up = raw.toUpperCase()
  // Ordem importa pouco; a resposta esperada e uma unica palavra.
  if (up.includes('BULLISH')) return 'BULLISH'
  if (up.includes('BEARISH')) return 'BEARISH'
  if (up.includes('NEUTRAL')) return 'NEUTRAL'
  return null
}

/**
 * Classifica o sentimento de UMA noticia. Retorna null em qualquer falha (sem API key, timeout,
 * resposta nao-parseavel). O chamador NAO deve persistir quando null — fica para a proxima rodada.
 */
export async function classifyNewsSentiment(
  title: string,
  content?: string | null,
): Promise<NewsSentiment | null> {
  if (!hasAIKey()) return null

  // Circuit aberto (credito esgotado recente): pular sem chamar a API nem logar.
  if (Date.now() < creditCircuitOpenUntil) return null

  const userPrompt =
    `Titulo: ${title}\n` +
    (content ? `Resumo: ${content.slice(0, 600)}\n` : '') +
    `\nSentimento:`

  try {
    const anthropic = getAnthropic()
    const res = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 8,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      },
      { timeout: 20_000 },
    )
    const textBlock = res.content.find((b): b is TextBlock => b.type === 'text')
    creditCircuitOpenUntil = 0 // sucesso fecha o circuito
    return parseSentiment(textBlock?.text ?? '')
  } catch (err) {
    if (isCreditExhaustedError(err) && Date.now() >= creditCircuitOpenUntil) {
      creditCircuitOpenUntil = Date.now() + CREDIT_EXHAUSTED_COOLDOWN_MS
      console.error(
        `[NewsSentimentClassifier][CIRCUIT_OPEN] Credito Anthropic esgotado — pausando ` +
        `classificacao por ${CREDIT_EXHAUSTED_COOLDOWN_MS / 60000}min ate recarga.`,
      )
    } else if (!isCreditExhaustedError(err)) {
      console.warn(
        '[NewsSentimentClassifier] falha ao classificar:',
        err instanceof Error ? err.message : err,
      )
    }
    return null
  }
}
