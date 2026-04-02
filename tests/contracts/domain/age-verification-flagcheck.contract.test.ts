// ============================================================================
// Foot Stock — Contrato de Verificação de Idade (ECA Digital / FlagCheck)
// Verifica: CPF nunca em plaintext, fallback, shape da resposta, fluxos ECA
// Rastreabilidade: INT-060, INT-109 | US-001 | module-28/TASK-3/ST004
// ============================================================================

import { createHash } from 'crypto'

// Mock do fetch global — antes de qualquer import que use fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock do prisma — verifyAgeForUser usa prisma.user.update
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: jest.fn().mockResolvedValue({}),
    },
  },
}))

// Mock de calcAge — controla a idade calculada sem depender de datas reais
jest.mock('@/lib/utils/formatDate', () => ({
  calcAge: jest.fn(),
}))

import { checkAge } from '@/lib/age-verification/flagcheck'
import { verifyAge } from '@/lib/services/age-verification'
import { calcAge } from '@/lib/utils/formatDate'

const mockCalcAge = calcAge as jest.MockedFunction<typeof calcAge>

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockFlagCheckSuccess(isAdult: boolean) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ isAdult }),
  } as Response)
}

function mockFlagCheckHttpError(status: number) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: `HTTP ${status}`,
  } as Response)
}

function mockFlagCheckNetworkError() {
  mockFetch.mockRejectedValueOnce(new Error('Network failure'))
}

const MOCK_CPF_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3'
const ADULT_BIRTHDATE = '1990-05-15'
const MINOR_BIRTHDATE = '2012-01-01'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Contrato de Verificação de Idade — ECA Digital / FlagCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.FLAGCHECK_API_URL
    delete process.env.FLAGCHECK_API_KEY
  })

  // ── checkAge (flagcheck.ts) ────────────────────────────────────────────────

  describe('[SUCCESS] checkAge — contrato de integração com FlagCheck API', () => {
    beforeEach(() => {
      process.env.FLAGCHECK_API_URL = 'https://api.flagcheck.example.com'
      process.env.FLAGCHECK_API_KEY = 'test-api-key'
    })

    it('deve retornar { isAdult: true } para adulto confirmado', async () => {
      mockFlagCheckSuccess(true)
      const result = await checkAge(MOCK_CPF_HASH)
      expect(result).toEqual({ isAdult: true })
    })

    it('deve retornar { isAdult: false } para menor confirmado', async () => {
      mockFlagCheckSuccess(false)
      const result = await checkAge(MOCK_CPF_HASH)
      expect(result).toEqual({ isAdult: false })
    })

    it('resposta deve conter APENAS isAdult — sem PII', async () => {
      mockFlagCheckSuccess(true)
      const result = await checkAge(MOCK_CPF_HASH)
      const keys = Object.keys(result)
      expect(keys).toEqual(['isAdult'])
      // Garante que CPF, nome, birthDate e demais dados pessoais não vazam
      expect(result).not.toHaveProperty('cpf')
      expect(result).not.toHaveProperty('cpfHash')
      expect(result).not.toHaveProperty('name')
      expect(result).not.toHaveProperty('birthDate')
    })

    it('deve enviar cpfHash no body da requisição (nunca CPF em plaintext)', async () => {
      mockFlagCheckSuccess(true)
      await checkAge(MOCK_CPF_HASH)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)

      // Contrato: body deve conter cpfHash
      expect(body).toHaveProperty('cpfHash', MOCK_CPF_HASH)
      // Contrato: body NÃO deve conter campo 'cpf' em plaintext
      expect(body).not.toHaveProperty('cpf')
    })

    it('deve fazer POST para {FLAGCHECK_API_URL}/verify', async () => {
      mockFlagCheckSuccess(true)
      await checkAge(MOCK_CPF_HASH)

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api.flagcheck.example.com/verify')
      expect(options.method).toBe('POST')
    })

    it('deve enviar X-Api-Key no header', async () => {
      mockFlagCheckSuccess(true)
      await checkAge(MOCK_CPF_HASH)

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      const headers = options.headers as Record<string, string>
      expect(headers['X-Api-Key']).toBe('test-api-key')
    })
  })

  // ── checkAge — erros de configuração ─────────────────────────────────────

  describe('[ERROR] checkAge — variáveis de ambiente obrigatórias', () => {
    it('deve lançar erro se FLAGCHECK_API_URL não estiver configurado', async () => {
      process.env.FLAGCHECK_API_KEY = 'test-key'
      // FLAGCHECK_API_URL ausente
      await expect(checkAge(MOCK_CPF_HASH)).rejects.toThrow(/FLAGCHECK_API_URL/)
    })

    it('deve lançar erro se FLAGCHECK_API_KEY não estiver configurado', async () => {
      process.env.FLAGCHECK_API_URL = 'https://api.flagcheck.example.com'
      // FLAGCHECK_API_KEY ausente
      await expect(checkAge(MOCK_CPF_HASH)).rejects.toThrow(/FLAGCHECK_API_KEY/)
    })

    it('deve lançar erro se ambas as variáveis estiverem ausentes', async () => {
      await expect(checkAge(MOCK_CPF_HASH)).rejects.toThrow()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('deve lançar erro em resposta HTTP não-ok (status 4xx/5xx)', async () => {
      process.env.FLAGCHECK_API_URL = 'https://api.flagcheck.example.com'
      process.env.FLAGCHECK_API_KEY = 'test-key'
      mockFlagCheckHttpError(503)

      await expect(checkAge(MOCK_CPF_HASH)).rejects.toMatchObject({
        status: 503,
      })
    })
  })

  // ── verifyAge (age-verification.ts) ───────────────────────────────────────

  describe('[SUCCESS] verifyAge — fluxo ECA Digital completo', () => {
    beforeEach(() => {
      process.env.FLAGCHECK_API_URL = 'https://api.flagcheck.example.com'
      process.env.FLAGCHECK_API_KEY = 'test-key'
    })

    it('adulto confirmado pela API retorna isAdult: true e verificationMethod: api', async () => {
      mockCalcAge.mockReturnValue(30)
      // API responde com is_adult: true (formato real do endpoint)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ is_adult: true }),
      } as Response)

      const result = await verifyAge('123.456.789-09', ADULT_BIRTHDATE)

      expect(result.isAdult).toBe(true)
      expect(result.verified).toBe(true)
      expect(result.verificationMethod).toBe('api')
    })

    it('menor detectado por data de nascimento retorna antes de chamar a API', async () => {
      mockCalcAge.mockReturnValue(15)

      const result = await verifyAge('000.000.000-00', MINOR_BIRTHDATE)

      expect(result.isAdult).toBe(false)
      expect(result.verified).toBe(true)
      expect(result.verificationMethod).toBe('birthdate')
      // Não deve ter chamado a API FlagCheck
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // ── verifyAge — resposta não contém PII ───────────────────────────────────

  describe('[SUCCESS] shape da resposta — sem PII', () => {
    beforeEach(() => {
      process.env.FLAGCHECK_API_URL = 'https://api.flagcheck.example.com'
      process.env.FLAGCHECK_API_KEY = 'test-key'
    })

    it('resposta de verifyAge nunca deve conter CPF, nome ou dados pessoais', async () => {
      mockCalcAge.mockReturnValue(25)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ is_adult: true }),
      } as Response)

      const result = await verifyAge('987.654.321-00', ADULT_BIRTHDATE)

      expect(result).not.toHaveProperty('cpf')
      expect(result).not.toHaveProperty('cpfHash')
      expect(result).not.toHaveProperty('name')
      expect(result).not.toHaveProperty('birthDate')
      expect(result).not.toHaveProperty('documentNumber')
    })

    it('resposta deve conter os campos obrigatórios do contrato AgeVerificationResult', async () => {
      mockCalcAge.mockReturnValue(30)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ is_adult: true }),
      } as Response)

      const result = await verifyAge('111.222.333-44', ADULT_BIRTHDATE)

      expect(result).toHaveProperty('isAdult')
      expect(result).toHaveProperty('verified')
      expect(result).toHaveProperty('verifiedAt')
      expect(result).toHaveProperty('verificationMethod')
      expect(typeof result.isAdult).toBe('boolean')
      expect(typeof result.verified).toBe('boolean')
      expect(typeof result.verifiedAt).toBe('string')
    })

    it('verificationMethod deve ser um dos valores válidos do contrato', async () => {
      mockCalcAge.mockReturnValue(28)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ is_adult: true }),
      } as Response)

      const result = await verifyAge('555.666.777-88', ADULT_BIRTHDATE)

      const VALID_METHODS = ['api', 'self_declaration', 'birthdate']
      expect(VALID_METHODS).toContain(result.verificationMethod)
    })
  })

  // ── verifyAge — fallback quando API indisponível ───────────────────────────

  describe('[EDGE] fallback — API FlagCheck indisponível', () => {
    beforeEach(() => {
      process.env.FLAGCHECK_API_URL = 'https://api.flagcheck.example.com'
      process.env.FLAGCHECK_API_KEY = 'test-key'
    })

    it('falha de rede retorna verified: false e isAdult: false (bloqueio ECA)', async () => {
      mockCalcAge.mockReturnValue(22)
      // Simular 3 tentativas falhando (retry 3x)
      mockFlagCheckNetworkError()
      mockFlagCheckNetworkError()
      mockFlagCheckNetworkError()

      const result = await verifyAge('999.888.777-66', ADULT_BIRTHDATE)

      expect(result.isAdult).toBe(false)
      expect(result.verified).toBe(false)
      expect(result.verificationMethod).toBe('self_declaration')
    }, 15000) // timeout maior por causa do backoff exponencial

    it('sem variáveis de ambiente retorna verified: false (API não configurada)', async () => {
      delete process.env.FLAGCHECK_API_URL
      delete process.env.FLAGCHECK_API_KEY
      mockCalcAge.mockReturnValue(25)

      const result = await verifyAge('111.111.111-11', ADULT_BIRTHDATE)

      expect(result.verified).toBe(false)
      expect(result.isAdult).toBe(false)
    })
  })

  // ── Integridade do hash (estrutural) ─────────────────────────────────────

  describe('[EDGE] integridade do contrato de hashing', () => {
    it('MOCK_CPF_HASH deve ser string hexadecimal (SHA-256 = 64 chars)', () => {
      // Verifica que o hash usado nos testes segue o formato correto
      expect(MOCK_CPF_HASH).toHaveLength(64)
      expect(/^[0-9a-f]{64}$/.test(MOCK_CPF_HASH)).toBe(true)
    })

    it('hash de CPFs diferentes deve gerar strings distintas', () => {
      const salt = 'foot-stock-v1'
      const hash1 = createHash('sha256').update(`12345678901${salt}`).digest('hex')
      const hash2 = createHash('sha256').update(`98765432100${salt}`).digest('hex')

      expect(hash1).not.toBe(hash2)
      expect(hash1).toHaveLength(64)
      expect(hash2).toHaveLength(64)
    })

    it('mesmo CPF com salt diferente gera hash diferente (anti-rainbow)', () => {
      const cpf = '12345678901'
      const hash1 = createHash('sha256').update(`${cpf}salt-v1`).digest('hex')
      const hash2 = createHash('sha256').update(`${cpf}salt-v2`).digest('hex')

      expect(hash1).not.toBe(hash2)
    })
  })
})
