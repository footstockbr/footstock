// ============================================================================
// FootStock — AliasService (T-031)
// Resolução de aliases de ticker com cache Redis.
//
// Resolve códigos do mundo real (FLA3) para tickers canônicos (URU3).
// Cache TTL: 1h. Invalidado ao adicionar/remover aliases via admin.
//
// server-only — nunca importar no cliente.
// ============================================================================

import 'server-only'

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { z } from 'zod'

const CACHE_PREFIX = 'alias:v1:'
const CACHE_TTL = 3600 // 1 hora
const NULL_SENTINEL = '__null__'

// Regex: 2-5 letras + 1-2 dígitos
const ALIAS_FORMAT = /^[A-Z]{2,5}\d{1,2}$/

/**
 * Normaliza e valida formato de ticker/alias.
 * Retorna uppercase ou null se formato inválido.
 */
function normalizeAlias(raw: string): string | null {
  if (!raw?.trim()) return null
  const upper = raw.toUpperCase().trim()
  return ALIAS_FORMAT.test(upper) ? upper : null
}

export const AliasService = {
  /**
   * Resolve um ticker (real ou alias) para o ticker canônico do sistema.
   *
   * Contrato:
   *   resolve("FLA3")  → "URU3"   (alias encontrado → retorna canônico)
   *   resolve("URU3")  → "URU3"   (já é canônico → retorna direto)
   *   resolve("fla3")  → "URU3"   (case-insensitive)
   *   resolve("XYZ9")  → null     (não encontrado)
   *
   * Mensagens de erro NUNCA expõem que a resolução de alias aconteceu.
   */
  async resolve(rawTicker: string): Promise<string | null> {
    const ticker = normalizeAlias(rawTicker)
    if (!ticker) return null

    // 1. Tentar cache Redis (< 1ms)
    const cacheKey = `${CACHE_PREFIX}${ticker}`
    try {
      const cached = await redis.get(cacheKey)
      if (cached !== null) {
        return cached === NULL_SENTINEL ? null : cached
      }
    } catch {
      // Cache miss não é erro — continua com DB
    }

    // 2. Verifica se já é ticker canônico ativo
    const canonical = await prisma.asset.findUnique({
      where: { ticker },
      select: { ticker: true, isActive: true },
    })
    if (canonical?.isActive) {
      await redis.setex(cacheKey, CACHE_TTL, canonical.ticker).catch(() => {})
      return canonical.ticker
    }

    // 3. Verifica em asset_aliases
    const alias = await prisma.assetAlias.findUnique({
      where: { alias: ticker },
      select: { assetTicker: true, isActive: true },
    })

    const result = alias?.isActive ? alias.assetTicker : null
    await redis.setex(cacheKey, CACHE_TTL, result ?? NULL_SENTINEL).catch(() => {})
    return result
  },

  /**
   * Retorna todos os aliases ativos para um ticker canônico.
   * Usado em admin para listar/gerenciar aliases.
   */
  async getAliasesForTicker(ticker: string): Promise<string[]> {
    const normalized = normalizeAlias(ticker)
    if (!normalized) return []

    const rows = await prisma.assetAlias.findMany({
      where: { assetTicker: normalized, isActive: true },
      select: { alias: true },
      orderBy: { alias: 'asc' },
    })
    return rows.map((r) => r.alias)
  },

  /**
   * Adiciona um alias para um ticker canônico.
   * Invalida cache Redis do alias.
   *
   * @throws se alias já existe (Prisma P2002 unique constraint)
   * @throws se alias aponta para si mesmo (prevenção de ciclo trivial)
   */
  async addAlias(ticker: string, rawAlias: string): Promise<void> {
    const normalizedTicker = normalizeAlias(ticker)
    const normalizedAlias = normalizeAlias(rawAlias)

    if (!normalizedTicker) throw new Error('Ticker canônico inválido.')
    if (!normalizedAlias) throw new Error('Formato de alias inválido. Use 2-5 letras + 1-2 dígitos (ex: FLA3).')

    // Prevenir alias = ticker (alias circular trivial)
    if (normalizedAlias === normalizedTicker) {
      throw new Error('Alias não pode ser igual ao ticker canônico.')
    }

    // Verificar se alias é ele mesmo um ticker canônico (causaria confusão)
    const isAliasCanonical = await prisma.asset.findUnique({
      where: { ticker: normalizedAlias },
      select: { ticker: true },
    })
    if (isAliasCanonical) {
      throw new Error(`${normalizedAlias} já é um ticker canônico do sistema e não pode ser registrado como alias.`)
    }

    // Verificar se o ticker de destino existe como ativo canônico (FK validation amigável)
    const targetExists = await prisma.asset.findUnique({
      where: { ticker: normalizedTicker },
      select: { ticker: true },
    })
    if (!targetExists) {
      throw new Error(`Ticker canônico ${normalizedTicker} não encontrado no sistema.`)
    }

    await prisma.assetAlias.upsert({
      where: { alias: normalizedAlias },
      create: { alias: normalizedAlias, assetTicker: normalizedTicker, isActive: true },
      update: { assetTicker: normalizedTicker, isActive: true },
    })

    // Invalidar cache
    await redis.del(`${CACHE_PREFIX}${normalizedAlias}`).catch(() => {})
  },

  /**
   * Remove (desativa) um alias.
   * Invalida cache Redis do alias.
   */
  async removeAlias(rawAlias: string): Promise<void> {
    const normalized = normalizeAlias(rawAlias)
    if (!normalized) throw new Error('Alias inválido.')

    await prisma.assetAlias.update({
      where: { alias: normalized },
      data: { isActive: false },
    })

    // Invalidar cache
    await redis.del(`${CACHE_PREFIX}${normalized}`).catch(() => {})
  },

  /**
   * Invalida todo o cache de aliases de um ticker canônico.
   * Chamado ao adicionar/remover aliases em lote.
   */
  async invalidateCacheForTicker(ticker: string): Promise<void> {
    const aliases = await AliasService.getAliasesForTicker(ticker)
    if (aliases.length === 0) return

    const keys = aliases.map((a) => `${CACHE_PREFIX}${a}`)
    await redis.del(...keys).catch(() => {})
    // Invalidar também o próprio ticker (canônico resolve para si mesmo)
    await redis.del(`${CACHE_PREFIX}${ticker.toUpperCase()}`).catch(() => {})
  },
}

export const addAliasSchema = z.object({
  alias: z
    .string()
    .min(3, 'Alias deve ter pelo menos 3 caracteres.')
    .max(6, 'Alias deve ter no máximo 6 caracteres.')
    .regex(/^[A-Za-z]{2,5}\d{1,2}$/, 'Formato inválido. Use 2-5 letras + 1-2 dígitos (ex: FLA3).'),
})
