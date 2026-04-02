// ============================================================================
// Foot Stock — AutoModeration
// 5 regras de auto-moderação configuráveis via Redis
// Fonte: module-18/TASK-4/ST001
// ============================================================================

import { redisPublisher as redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const MODERATION_RULE_ID = {
  DELETE_3_FLAGS: 1,
  BAN_IP_BURST: 2,
  HIDE_SUSPENDED: 3,
  NEW_USER_RESTRICT: 4,
  HOURLY_LIMIT: 5,
} as const
export type ModerationRuleId = (typeof MODERATION_RULE_ID)[keyof typeof MODERATION_RULE_ID]

export interface ModerationRule {
  id: ModerationRuleId
  name: string
  description: string
  enabled: boolean
  config?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Regras padrão (todas desabilitadas por padrão)
// ---------------------------------------------------------------------------

const DEFAULT_RULES: ModerationRule[] = [
  {
    id: MODERATION_RULE_ID.DELETE_3_FLAGS,
    name: 'Auto-Delete 3 Flags',
    description: 'Deletar posts que recebam 3 ou mais denúncias',
    enabled: false,
  },
  {
    id: MODERATION_RULE_ID.BAN_IP_BURST,
    name: 'IP Burst Ban',
    description: 'Banir IP após 5 posts em 1 minuto',
    enabled: false,
  },
  {
    id: MODERATION_RULE_ID.HIDE_SUSPENDED,
    name: 'Hide Suspended',
    description: 'Ocultar posts de usuários suspensos (visível apenas para admin)',
    enabled: false,
  },
  {
    id: MODERATION_RULE_ID.NEW_USER_RESTRICT,
    name: 'New User Ticker Restrict',
    description: 'Proibir posts sobre tickers específicos para contas com menos de 7 dias',
    enabled: false,
    config: { restrictedTickers: [], minAccountAgeDays: 7 },
  },
  {
    id: MODERATION_RULE_ID.HOURLY_LIMIT,
    name: 'Hourly Post Limit',
    description: 'Limite de 5 posts por hora por usuário (configurável pelo SuperAdmin)',
    enabled: false,
    config: { limit: 5 },
  },
]

const RULES_CACHE_KEY = 'moderation:rules'

// ---------------------------------------------------------------------------
// AutoModeration
// ---------------------------------------------------------------------------

export class AutoModeration {
  /**
   * Busca as regras. Ordem: Redis → DB → DEFAULT_RULES (in-memory).
   */
  async getRules(): Promise<ModerationRule[]> {
    // 1) Tentar Redis
    try {
      const cached = await redis.get(RULES_CACHE_KEY)
      if (cached) {
        return JSON.parse(cached) as ModerationRule[]
      }
    } catch {
      // Redis indisponível — tentar DB
    }

    // 2) Fallback: banco de dados
    try {
      const dbRules = await prisma.moderationRule.findMany({ orderBy: { id: 'asc' } })
      if (dbRules.length > 0) {
        const rules = dbRules.map(r => ({
          id: r.id as ModerationRuleId,
          name: r.name,
          description: r.description,
          enabled: r.enabled,
          config: r.config as Record<string, unknown> | undefined,
        }))
        // Repopular Redis com dados do DB
        try {
          await redis.set(RULES_CACHE_KEY, JSON.stringify(rules))
        } catch {
          // Ignorar falha de cache
        }
        return rules
      }
    } catch {
      // DB também indisponível
    }

    // 3) Último recurso: defaults em memória
    return [...DEFAULT_RULES]
  }

  /**
   * Atualiza uma regra no Redis e sincroniza com DB.
   */
  async updateRule(
    ruleId: ModerationRuleId,
    updates: Partial<ModerationRule>
  ): Promise<ModerationRule> {
    const rules = await this.getRules()
    const idx = rules.findIndex(r => r.id === ruleId)
    if (idx === -1) throw new Error(`Regra ${ruleId} não encontrada.`)
    const current = rules[idx]
    if (!current) throw new Error(`Regra ${ruleId} não encontrada.`)

    rules[idx] = {
      ...current,
      ...updates,
      id: ruleId,
      name: updates.name ?? current.name,
      description: updates.description ?? current.description,
      enabled: updates.enabled ?? current.enabled,
    }

    const updated = rules[idx] ?? current

    // Persistir no Redis
    try {
      await redis.set(RULES_CACHE_KEY, JSON.stringify(rules))
    } catch {
      // Falha silenciosa
    }

    // Sincronizar com DB (backup persistente)
    try {
      await prisma.moderationRule.upsert({
        where: { id: ruleId },
        create: {
          id: ruleId,
          name: updated.name,
          description: updated.description,
          enabled: updated.enabled,
          config: updated.config !== undefined ? (updated.config as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
        update: {
          enabled: updated.enabled,
          config: updated.config !== undefined ? (updated.config as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      })
    } catch {
      // Falha de DB não bloqueia a operação
    }

    return updated
  }

  /**
   * Aplica as regras habilitadas ao post sendo criado.
   * Retorna { blocked: true, reason } se alguma regra bloquear.
   */
  async aplicarRegras(
    userId: string,
    content: string,
    userCreatedAt: Date
  ): Promise<{ blocked: boolean; reason?: string }> {
    let rules: ModerationRule[]
    try {
      rules = await this.getRules()
    } catch {
      rules = [...DEFAULT_RULES]
    }

    const enabledRules = rules.filter(r => r.enabled)

    for (const rule of enabledRules) {
      try {
        if (rule.id === MODERATION_RULE_ID.HIDE_SUSPENDED) {
          // Regra 3: bloquear posts de usuários suspensos
          const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { status: true },
          })
          if (dbUser?.status === 'SUSPENDED') {
            return { blocked: true, reason: 'Usuário suspenso não pode publicar.' }
          }
        }

        if (rule.id === MODERATION_RULE_ID.BAN_IP_BURST) {
          // Regra 2: 5 posts em 1 minuto por userId (sem IP no server-side Next.js)
          const key = `forum:burst:${userId}`
          const count = await redis.incr(key)
          if (count === 1) await redis.expire(key, 60)
          if (count >= 5) {
            return { blocked: true, reason: 'Muitas publicações em curto período.' }
          }
        }

        if (rule.id === MODERATION_RULE_ID.NEW_USER_RESTRICT) {
          // Regra 4: conta < 7 dias + ticker restrito
          const config = rule.config as { restrictedTickers: string[]; minAccountAgeDays: number } | undefined
          const minDays = config?.minAccountAgeDays ?? 7
          const restrictedTickers = config?.restrictedTickers ?? []
          const accountAgeDays = (Date.now() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24)

          if (accountAgeDays < minDays && restrictedTickers.length > 0) {
            const hasRestricted = restrictedTickers.some(t =>
              content.toLowerCase().includes(t.toLowerCase())
            )
            if (hasRestricted) {
              return { blocked: true, reason: 'Conta nova: restrição temporária para este ticker.' }
            }
          }
        }

        if (rule.id === MODERATION_RULE_ID.HOURLY_LIMIT) {
          // Regra 5: limite configurável por hora (distinto do rate limit fixo de 30/hora)
          const config = rule.config as { limit: number } | undefined
          const limit = config?.limit ?? 5
          const key = `forum:hourly:${userId}`
          const count = await redis.incr(key)
          if (count === 1) await redis.expire(key, 3600)
          if (count > limit) {
            return { blocked: true, reason: `Limite de ${limit} posts por hora atingido.` }
          }
        }
      } catch {
        // Redis falhou para esta regra — continuar com próxima
        continue
      }
    }

    return { blocked: false }
  }

  /**
   * Verifica se post deve ser auto-deletado pela Regra 1 (3+ flags).
   * Se deletado: retorna true.
   */
  async verificarFlagsAutoDeletion(
    postId: string,
    flagCount: number
  ): Promise<boolean> {
    const rules = await this.getRules()
    const rule1 = rules.find(r => r.id === MODERATION_RULE_ID.DELETE_3_FLAGS)

    if (rule1?.enabled && flagCount >= 3) {
      await prisma.globalForumPost.update({
        where: { id: postId },
        data: { isDeleted: true },
      })
      return true
    }

    return false
  }
}

export const autoModeration = new AutoModeration()
