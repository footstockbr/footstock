// ============================================================================
// Foot Stock — ForumService Tests
// Sanitização PII + palavras bloqueadas + processPost
// Fonte: module-18/TASK-4/ST003
// ============================================================================

import { ForumService } from '../ForumService'

// Mock do redis e prisma
jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    get: jest.fn(),
    setex: jest.fn(),
  },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    blockedWord: {
      findMany: jest.fn(),
    },
  },
}))

import { redisPublisher as redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

const redisMock = redis as jest.Mocked<typeof redis>
const prismaMock = prisma as jest.Mocked<typeof prisma>

describe('ForumService', () => {
  let service: ForumService

  beforeEach(() => {
    service = new ForumService()
    jest.clearAllMocks()
  })

  // ─── sanitizeContent ───────────────────────────────────────────────────────

  describe('sanitizeContent', () => {
    it('deve remover CPF no formato 000.000.000-00', () => {
      const result = service.sanitizeContent('Meu CPF é 123.456.789-00 e acho que FLM vai subir')
      expect(result).not.toContain('123.456.789-00')
      expect(result).toContain('[removido]')
      expect(result).toContain('FLM vai subir')
    })

    it('deve remover CPF no formato 00000000000 (sem pontuação)', () => {
      const result = service.sanitizeContent('CPF: 12345678900 na carteira')
      expect(result).not.toContain('12345678900')
    })

    it('deve remover CNPJ', () => {
      const result = service.sanitizeContent('Empresa 12.345.678/0001-90 está comprando FLM')
      expect(result).not.toContain('12.345.678/0001-90')
      expect(result).toContain('[removido]')
    })

    it('deve remover telefone com DDD', () => {
      const result = service.sanitizeContent('Ligue (11) 99999-8888 para saber mais')
      expect(result).not.toContain('99999-8888')
      expect(result).toContain('[removido]')
    })

    it('deve remover endereço de email', () => {
      const result = service.sanitizeContent('Contato em user@example.com para análises')
      expect(result).not.toContain('user@example.com')
      expect(result).toContain('[removido]')
    })

    it('deve remover URLs https', () => {
      const result = service.sanitizeContent('Veja https://example.com/analise para detalhes')
      expect(result).not.toContain('https://example.com/analise')
      expect(result).toContain('[removido]')
    })

    it('deve remover URLs http', () => {
      const result = service.sanitizeContent('Site: http://analise.com.br/flm')
      expect(result).not.toContain('http://analise.com.br/flm')
      expect(result).toContain('[removido]')
    })

    it('deve preservar texto que não é PII', () => {
      const result = service.sanitizeContent('FLM vai subir amanhã. Análise técnica mostra suporte em FS$ 45.')
      expect(result).toBe('FLM vai subir amanhã. Análise técnica mostra suporte em FS$ 45.')
    })

    it('deve retornar string vazia quando conteúdo é composto apenas de PII', () => {
      const result = service.sanitizeContent('123.456.789-00 user@mail.com (11) 99999-8888')
      expect(result.trim()).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
      expect(result.trim()).not.toContain('@')
    })

    it('deve remover múltiplos PII no mesmo conteúdo', () => {
      const result = service.sanitizeContent(
        'CPF 123.456.789-00, email user@test.com, tel (21) 99888-7766'
      )
      expect(result).not.toContain('123.456.789-00')
      expect(result).not.toContain('user@test.com')
      expect(result).not.toContain('99888-7766')
    })
  })

  // ─── checkBlockedWords ─────────────────────────────────────────────────────

  describe('checkBlockedWords', () => {
    it('deve retornar isBlocked=true para match case-insensitive', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(['spamword', 'palavrão']))

      const result = await service.checkBlockedWords('Eu acho que SPAMWORD vai subir')
      expect(result.isBlocked).toBe(true)
      expect(result.matchedWords).toContain('spamword')
    })

    it('deve usar cache Redis quando disponível (sem query ao banco)', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(['badword']))

      await service.checkBlockedWords('texto limpo')
      expect(prismaMock.blockedWord.findMany).not.toHaveBeenCalled()
    })

    it('deve popular cache Redis com TTL=300 em cache miss', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(null)
      ;(prismaMock.blockedWord.findMany as jest.Mock).mockResolvedValueOnce([
        { word: 'spam' },
      ])

      await service.checkBlockedWords('texto sem problema')

      expect(redisMock.setex).toHaveBeenCalledWith(
        'blocked_words:list',
        300,
        JSON.stringify(['spam'])
      )
    })

    it('deve retornar isBlocked=false para conteúdo limpo', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(['badword']))

      const result = await service.checkBlockedWords('FLM vai subir amanhã')
      expect(result.isBlocked).toBe(false)
      expect(result.matchedWords).toHaveLength(0)
    })

    it('deve retornar isBlocked=false quando lista de palavras está vazia', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([]))

      const result = await service.checkBlockedWords('qualquer conteúdo')
      expect(result.isBlocked).toBe(false)
    })
  })

  // ─── processPost ───────────────────────────────────────────────────────────

  describe('processPost', () => {
    it('deve retornar shouldFlag=true para palavra bloqueada', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(['spam']))

      const result = await service.processPost('spam vai dominar o mercado', 'user-1')
      expect(result.shouldFlag).toBe(true)
    })

    it('deve retornar shouldFlag=false para conteúdo limpo', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(['proibido']))

      const result = await service.processPost('FLM vai subir na próxima rodada', 'user-1')
      expect(result.shouldFlag).toBe(false)
    })

    it('deve sanitizar conteúdo antes de verificar palavras bloqueadas', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([]))

      const result = await service.processPost(
        'CPF 123.456.789-00 — FLM está boa',
        'user-1'
      )
      expect(result.sanitized).not.toContain('123.456.789-00')
      expect(result.sanitized).toContain('FLM está boa')
    })

    it('deve retornar string sanitizada no campo sanitized', async () => {
      ;(redisMock.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([]))

      const result = await service.processPost('Análise do FLM para amanhã', 'user-1')
      expect(result.sanitized).toBe('Análise do FLM para amanhã')
    })
  })
})
