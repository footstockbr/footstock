// ============================================================================
// Foot Stock — AutoModeration Tests
// 5 regras de moderação + Redis fallback
// Fonte: module-18/TASK-4/ST004
// ============================================================================

import { AutoModeration, MODERATION_RULE_ID } from '../AutoModeration'
import type { ModerationRule } from '../AutoModeration'

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    globalForumPost: {
      update: jest.fn(),
    },
  },
}))

import { redisPublisher as redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

const redisMock = redis as jest.Mocked<typeof redis>
const prismaMock = prisma as jest.Mocked<typeof prisma>

describe('AutoModeration', () => {
  let moderation: AutoModeration
  const fakeDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 dias atrás

  beforeEach(() => {
    moderation = new AutoModeration()
    jest.clearAllMocks()
  })

  // ─── getRules ─────────────────────────────────────────────────────────────

  describe('getRules', () => {
    it('deve retornar DEFAULT_RULES quando Redis está vazio (primeira execução)', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(null)

      const rules = await moderation.getRules()
      expect(rules).toHaveLength(5)
      expect(rules.every(r => r.enabled === false)).toBe(true)
    })

    it('deve retornar regras customizadas do Redis', async () => {
      const customRules: ModerationRule[] = [
        { id: MODERATION_RULE_ID.DELETE_3_FLAGS, name: 'Auto-Delete 3 Flags', description: '', enabled: true },
        { id: MODERATION_RULE_ID.BAN_IP_BURST, name: 'IP Burst Ban', description: '', enabled: false },
        { id: MODERATION_RULE_ID.HIDE_SUSPENDED, name: 'Hide Suspended', description: '', enabled: false },
        { id: MODERATION_RULE_ID.NEW_USER_RESTRICT, name: 'New User', description: '', enabled: false },
        { id: MODERATION_RULE_ID.HOURLY_LIMIT, name: 'Hourly Limit', description: '', enabled: false },
      ]
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(customRules))

      const rules = await moderation.getRules()
      expect(rules[0]!.enabled).toBe(true) // Regra 1 habilitada
      expect(rules[1]!.enabled).toBe(false)
    })

    it('deve retornar DEFAULT_RULES se Redis lança exceção', async () => {
      ;(redisMock.get as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'))

      const rules = await moderation.getRules()
      expect(rules).toHaveLength(5)
      expect(rules.every(r => r.enabled === false)).toBe(true)
    })
  })

  // ─── updateRule ────────────────────────────────────────────────────────────

  describe('updateRule', () => {
    it('deve habilitar regra e salvar no Redis', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(null)
      ;(redisMock.set as jest.Mock).mockResolvedValueOnce('OK')

      const updated = await moderation.updateRule(MODERATION_RULE_ID.DELETE_3_FLAGS, { enabled: true })
      expect(updated.enabled).toBe(true)
      expect(redisMock.set).toHaveBeenCalledWith(
        'moderation:rules',
        expect.stringContaining('"enabled":true')
      )
    })

    it('deve lançar erro para ruleId inexistente', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(null)

      await expect(
        moderation.updateRule(99 as never, { enabled: true })
      ).rejects.toThrow('Regra 99 não encontrada')
    })
  })

  // ─── aplicarRegras ─────────────────────────────────────────────────────────

  describe('aplicarRegras', () => {
    it('deve retornar blocked=false quando todas as regras estão desabilitadas', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(null) // DEFAULT_RULES, todos disabled

      const result = await moderation.aplicarRegras('user-1', 'FLM vai subir', fakeDate)
      expect(result.blocked).toBe(false)
    })

    it('deve bloquear por IP Burst quando regra 2 habilitada e count >= 5', async () => {
      const rules: ModerationRule[] = [
        { id: 1, name: '', description: '', enabled: false },
        { id: 2, name: '', description: '', enabled: true },
        { id: 3, name: '', description: '', enabled: false },
        { id: 4, name: '', description: '', enabled: false },
        { id: 5, name: '', description: '', enabled: false },
      ]
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(rules))
      ;(redisMock.incr as jest.Mock).mockResolvedValueOnce(5)
      ;(redisMock.expire as jest.Mock).mockResolvedValueOnce(1)

      const result = await moderation.aplicarRegras('user-1', 'post', fakeDate)
      expect(result.blocked).toBe(true)
      expect(result.reason).toContain('curto período')
    })

    it('deve bloquear por Hourly Limit quando regra 5 habilitada e count > limite', async () => {
      const rules: ModerationRule[] = [
        { id: 1, name: '', description: '', enabled: false },
        { id: 2, name: '', description: '', enabled: false },
        { id: 3, name: '', description: '', enabled: false },
        { id: 4, name: '', description: '', enabled: false },
        { id: 5, name: '', description: '', enabled: true, config: { limit: 5 } },
      ]
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(rules))
      ;(redisMock.incr as jest.Mock).mockResolvedValueOnce(6) // acima do limite de 5
      ;(redisMock.expire as jest.Mock).mockResolvedValueOnce(1)

      const result = await moderation.aplicarRegras('user-1', 'post', fakeDate)
      expect(result.blocked).toBe(true)
      expect(result.reason).toContain('5 posts por hora')
    })

    it('deve usar DEFAULT_RULES se Redis falhar ao buscar regras', async () => {
      ;(redisMock.get as jest.Mock).mockRejectedValueOnce(new Error('Redis down'))

      const result = await moderation.aplicarRegras('user-1', 'post', fakeDate)
      // DEFAULT_RULES = all disabled → não deve bloquear
      expect(result.blocked).toBe(false)
    })
  })

  // ─── verificarFlagsAutoDeletion ────────────────────────────────────────────

  describe('verificarFlagsAutoDeletion', () => {
    it('deve deletar post quando regra 1 habilitada e flagCount >= 3', async () => {
      const rules: ModerationRule[] = [
        { id: 1, name: '', description: '', enabled: true },
        { id: 2, name: '', description: '', enabled: false },
        { id: 3, name: '', description: '', enabled: false },
        { id: 4, name: '', description: '', enabled: false },
        { id: 5, name: '', description: '', enabled: false },
      ]
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(rules))
      ;(prismaMock.globalForumPost.update as jest.Mock).mockResolvedValueOnce({})

      const deleted = await moderation.verificarFlagsAutoDeletion('post-1', 3)
      expect(deleted).toBe(true)
      expect(prismaMock.globalForumPost.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { isDeleted: true },
      })
    })

    it('deve não deletar quando regra 1 está desabilitada', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(null) // DEFAULT_RULES disabled

      const deleted = await moderation.verificarFlagsAutoDeletion('post-1', 5)
      expect(deleted).toBe(false)
      expect(prismaMock.globalForumPost.update).not.toHaveBeenCalled()
    })

    it('deve não deletar quando flagCount < 3', async () => {
      const rules: ModerationRule[] = [
        { id: 1, name: '', description: '', enabled: true },
        { id: 2, name: '', description: '', enabled: false },
        { id: 3, name: '', description: '', enabled: false },
        { id: 4, name: '', description: '', enabled: false },
        { id: 5, name: '', description: '', enabled: false },
      ]
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(rules))

      const deleted = await moderation.verificarFlagsAutoDeletion('post-1', 2)
      expect(deleted).toBe(false)
    })
  })
})
