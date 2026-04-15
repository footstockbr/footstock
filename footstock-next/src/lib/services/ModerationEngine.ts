// ============================================================================
// Foot Stock — ModerationEngine (T-028)
// Sanitização sempre ativa + 5 regras de conteúdo configuráveis
//
// Pipeline:
//   1. sanitizePost() — remove PII/URLs (SEMPRE ativa, não configurável)
//   2. applyRules()   — aplica regras habilitadas (carregadas do DB + Redis cache)
//
// Posts flagrados ficam com status=FLAGGED e não aparecem publicamente até
// aprovação do admin.
// ============================================================================

import { redisPublisher as redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const RULES_CACHE_KEY = 'content_moderation:rules'
const RULES_CACHE_TTL = 300 // 5 minutos

// IDs canônicos das 5 regras de conteúdo (slug = campo name no DB)
export const CONTENT_RULE_SLUGS = {
  NEW_USER_WITH_LINKS: 'new_user_with_links',
  SPAM_FREQUENCY: 'spam_frequency',
  FALSE_PROMISES: 'false_promises',
  RESIDUAL_PII: 'residual_pii',
  FOREIGN_SPAM: 'foreign_spam',
} as const

export type ContentRuleSlug = (typeof CONTENT_RULE_SLUGS)[keyof typeof CONTENT_RULE_SLUGS]

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ContentModerationRuleDTO {
  id: string
  name: string
  description: string
  pattern: string
  isEnabled: boolean
}

export interface SanitizeResult {
  sanitized: string  // conteúdo com PII/URLs redatadas (persistido em content)
  contentRaw: string // conteúdo original antes da sanitização (persistido em contentRaw)
  wasSanitized: boolean
}

export interface ApplyRulesResult {
  flaggedBy: string[] // nomes das regras que fizeram match
  isFlagged: boolean
}

// ---------------------------------------------------------------------------
// Regex de Sanitização (SEMPRE ativa — não configurável)
// ---------------------------------------------------------------------------

const SANITIZE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // CPF: 000.000.000-00 ou 00000000000
  {
    regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    replacement: '[REDACTED]',
  },
  // CNPJ: 00.000.000/0000-00
  {
    regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?0001-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
    replacement: '[REDACTED]',
  },
  // Telefone: (11) 99999-8888, 11999998888, +55 11 9...
  {
    regex: /(\+55\s?)?(\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}/g,
    replacement: '[REDACTED]',
  },
  // E-mail
  {
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED]',
  },
  // URLs http/https
  {
    regex: /https?:\/\/[^\s]+/g,
    replacement: '[LINK REMOVIDO]',
  },
  // URLs www.
  {
    regex: /www\.[^\s]+/g,
    replacement: '[LINK REMOVIDO]',
  },
]

// ---------------------------------------------------------------------------
// Funções de Sanitização (puras — sem acesso a DB/Redis)
// ---------------------------------------------------------------------------

/**
 * Sanitiza o conteúdo removendo PII e URLs.
 * SEMPRE executada antes de persistir — não pode ser desabilitada.
 *
 * @param content conteúdo original do post
 * @returns SanitizeResult com sanitized (para persistir) e contentRaw (original)
 */
export function sanitizePost(content: string): SanitizeResult {
  let sanitized = content
  let wasSanitized = false

  for (const { regex, replacement } of SANITIZE_PATTERNS) {
    regex.lastIndex = 0
    if (regex.test(sanitized)) {
      wasSanitized = true
    }
    regex.lastIndex = 0
    sanitized = sanitized.replace(regex, replacement)
    regex.lastIndex = 0
  }

  return {
    sanitized,
    contentRaw: content,
    wasSanitized,
  }
}

// ---------------------------------------------------------------------------
// Cache de regras compiladas (module-level, revalidado a cada 5min)
// ---------------------------------------------------------------------------

interface CompiledRule {
  id: string
  name: string
  pattern: RegExp | null // null = regra de lógica especial (sem regex simples)
  isEnabled: boolean
}

let _compiledCache: { rules: CompiledRule[]; expiresAt: number } | null = null

function compileRules(dbRules: ContentModerationRuleDTO[]): CompiledRule[] {
  return dbRules.map((r) => {
    let compiled: RegExp | null = null
    try {
      // ReDoS prevention: padrões com mais de 500 chars são rejeitados
      if (r.pattern && r.pattern.length < 500) {
        compiled = new RegExp(r.pattern, 'i')
      }
    } catch {
      console.error(`[ModerationEngine] Regex inválida para regra ${r.name}: ${r.pattern}`)
    }
    return { id: r.id, name: r.name, pattern: compiled, isEnabled: r.isEnabled }
  })
}

// ---------------------------------------------------------------------------
// ModerationEngine
// ---------------------------------------------------------------------------

export class ModerationEngine {
  /**
   * Carrega regras do Redis (cache 5min) → fallback DB → fallback vazio.
   * Compila regexes em memória com invalidação por TTL.
   */
  async loadRules(): Promise<CompiledRule[]> {
    const now = Date.now()

    // 1) Cache em memória ainda válido
    if (_compiledCache && now < _compiledCache.expiresAt) {
      return _compiledCache.rules
    }

    // 2) Tentar Redis
    try {
      const cached = await redis.get(RULES_CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached) as ContentModerationRuleDTO[]
        const compiled = compileRules(parsed)
        _compiledCache = { rules: compiled, expiresAt: now + RULES_CACHE_TTL * 1000 }
        return compiled
      }
    } catch {
      // Redis indisponível — continuar para DB
    }

    // 3) DB
    try {
      const dbRules = await prisma.contentModerationRule.findMany({
        orderBy: { createdAt: 'asc' },
      })
      const dtos: ContentModerationRuleDTO[] = dbRules.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        pattern: r.pattern,
        isEnabled: r.isEnabled,
      }))

      // Popular Redis
      try {
        await redis.setex(RULES_CACHE_KEY, RULES_CACHE_TTL, JSON.stringify(dtos))
      } catch {
        // Falha de cache — não bloquear
      }

      const compiled = compileRules(dtos)
      _compiledCache = { rules: compiled, expiresAt: now + RULES_CACHE_TTL * 1000 }
      return compiled
    } catch {
      // DB indisponível
      console.error('[ModerationEngine] Falha ao carregar regras do DB')
      return []
    }
  }

  /**
   * Invalida o cache em memória e no Redis (chamar após toggle de regra).
   */
  async invalidateCache(): Promise<void> {
    _compiledCache = null
    try {
      await redis.del(RULES_CACHE_KEY)
    } catch {
      // Ignorar falha de Redis
    }
  }

  /**
   * Aplica regras habilitadas ao conteúdo sanitizado.
   * Retorna lista de nomes de regras que fizeram match.
   *
   * Regras especiais (não regex simples):
   * - new_user_with_links: precisa de userCreatedAt
   * - spam_frequency:      precisa de userId + Redis
   *
   * @param sanitized conteúdo já sanitizado (sem PII)
   * @param userId    ID do usuário que está postando
   * @param userCreatedAt data de criação da conta do usuário
   */
  async applyRules(
    sanitized: string,
    userId: string,
    userCreatedAt: Date
  ): Promise<ApplyRulesResult> {
    const rules = await this.loadRules()
    const enabledRules = rules.filter((r) => r.isEnabled)
    const flaggedBy: string[] = []

    for (const rule of enabledRules) {
      try {
        let matched = false

        if (rule.name === CONTENT_RULE_SLUGS.NEW_USER_WITH_LINKS) {
          // Regra 1: usuário com <7 dias de conta postando links externos
          // A sanitização já removeu os links do conteúdo; verificamos no contentRaw
          // Mas aqui recebemos sanitized — a regra verifica [LINK REMOVIDO] no sanitized
          const accountAgeDays =
            (Date.now() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
          if (accountAgeDays < 7 && sanitized.includes('[LINK REMOVIDO]')) {
            matched = true
          }
        } else if (rule.name === CONTENT_RULE_SLUGS.SPAM_FREQUENCY) {
          // Regra 2: mesmo conteúdo ou similar postado 3+ vezes em 1 hora
          const key = `forum:spam:${userId}`
          const fingerprint = sanitized
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 100)
          const existing = await redis.get(key)
          if (existing) {
            const history: string[] = JSON.parse(existing)
            // Verificar se fingerprint já aparece 3+ vezes (similaridade simples)
            const similar = history.filter(
              (h) =>
                h === fingerprint ||
                (h.length > 10 && fingerprint.includes(h.slice(0, 10)))
            )
            if (similar.length >= 2) {
              // 2 existentes + este = 3 total
              matched = true
            }
            history.push(fingerprint)
            await redis.setex(key, 3600, JSON.stringify(history.slice(-20)))
          } else {
            await redis.setex(key, 3600, JSON.stringify([fingerprint]))
          }
        } else if (rule.pattern) {
          // Regras 3, 4, 5: aplicar regex ao conteúdo sanitizado
          matched = rule.pattern.test(sanitized)
        }

        if (matched) {
          flaggedBy.push(rule.name)
        }
      } catch {
        // Falha em regra individual não bloqueia as demais
        console.error(`[ModerationEngine] Erro na regra ${rule.name}`)
      }
    }

    return { flaggedBy, isFlagged: flaggedBy.length > 0 }
  }

  /**
   * Pipeline completo: sanitizar → aplicar regras.
   */
  async process(
    content: string,
    userId: string,
    userCreatedAt: Date
  ): Promise<{
    sanitized: string
    contentRaw: string
    wasSanitized: boolean
    flaggedBy: string[]
    isFlagged: boolean
  }> {
    const { sanitized, contentRaw, wasSanitized } = sanitizePost(content)
    const { flaggedBy, isFlagged } = await this.applyRules(sanitized, userId, userCreatedAt)

    return { sanitized, contentRaw, wasSanitized, flaggedBy, isFlagged }
  }
}

export const moderationEngine = new ModerationEngine()
