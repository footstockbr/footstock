// ============================================================================
// Foot Stock — ForumService
// Sanitização de PII + verificação de palavras bloqueadas
// Fonte: module-18/TASK-1/ST003
// ============================================================================

import { redisPublisher as redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const BLOCKED_WORDS_CACHE_KEY = 'blocked_words:list'
const BLOCKED_WORDS_TTL = 300 // 5 minutos

// ---------------------------------------------------------------------------
// Regex de PII
// ---------------------------------------------------------------------------

const PII_PATTERNS: RegExp[] = [
  // CPF: 000.000.000-00 ou 00000000000
  /\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}/g,
  // CNPJ: 00.000.000/0000-00
  /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/.\s]?\d{4}[-.\s]?\d{2}/g,
  // Telefone: (11) 99999-8888 ou 11999998888
  /\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4}/g,
  // E-mail
  /[\w.-]+@[\w.-]+\.\w{2,}/g,
  // URLs http/https
  /https?:\/\/[^\s]+/g,
]

// ---------------------------------------------------------------------------
// ForumService
// ---------------------------------------------------------------------------

export class ForumService {
  /**
   * Remove dados pessoais (PII) do conteúdo do post.
   * Substitui por [removido].
   */
  sanitizeContent(content: string): string {
    let sanitized = content
    for (const pattern of PII_PATTERNS) {
      // Reset regex state para evitar erros com flag /g
      pattern.lastIndex = 0
      sanitized = sanitized.replace(pattern, '[removido]')
    }
    return sanitized
  }

  /**
   * Verifica se o conteúdo contém palavras bloqueadas.
   * Usa cache Redis (TTL 5min). Em cache miss, busca do banco.
   */
  async checkBlockedWords(
    content: string
  ): Promise<{ isBlocked: boolean; matchedWords: string[] }> {
    let words: string[] = []

    try {
      const cached = await redis.get(BLOCKED_WORDS_CACHE_KEY)
      if (cached) {
        words = JSON.parse(cached) as string[]
      } else {
        const rows = await prisma.blockedWord.findMany({
          select: { word: true },
        })
        words = rows.map(r => r.word.toLowerCase())
        await redis.setex(BLOCKED_WORDS_CACHE_KEY, BLOCKED_WORDS_TTL, JSON.stringify(words))
      }
    } catch {
      // Redis indisponível — fallback para banco
      try {
        const rows = await prisma.blockedWord.findMany({ select: { word: true } })
        words = rows.map(r => r.word.toLowerCase())
      } catch {
        words = []
      }
    }

    if (words.length === 0) return { isBlocked: false, matchedWords: [] }

    const lowerContent = content.toLowerCase()
    const matchedWords = words.filter(w => lowerContent.includes(w))

    return {
      isBlocked: matchedWords.length > 0,
      matchedWords,
    }
  }

  /**
   * Pipeline completo: sanitizar PII → verificar palavras bloqueadas.
   * Retorna conteúdo sanitizado e flag de moderação.
   */
  async processPost(
    content: string,
    _userId: string
  ): Promise<{ sanitized: string; shouldFlag: boolean }> {
    const sanitized = this.sanitizeContent(content)
    const { isBlocked } = await this.checkBlockedWords(sanitized)

    return {
      sanitized,
      shouldFlag: isBlocked,
    }
  }
}

export const forumService = new ForumService()
