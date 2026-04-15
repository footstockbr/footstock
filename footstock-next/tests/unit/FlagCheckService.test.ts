// ============================================================================
// Foot Stock — Testes unitários: FlagCheckService (T-023)
// Verifica: retry, timeout, hash normalization, minor detection, fallback
// ============================================================================

import { verifyAgeViaFlagCheck } from '@/lib/services/FlagCheckService'

// Mock do hashCPF para controlar o output
jest.mock('@/lib/utils/crypto', () => ({
  hashCPF: jest.fn((cpf: string) => {
    const normalized = cpf.replace(/\D/g, '')
    return `mock-hash-${normalized}`
  }),
}))

// Mock do fetch global
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('verifyAgeViaFlagCheck', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      FLAGCHECK_API_URL: 'https://api.flagcheck.test/v1',
      FLAGCHECK_API_KEY: 'test-api-key-123',
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  // ── Config ausente ────────────────────────────────────────────────────────

  describe('configuração ausente', () => {
    it('retorna CONFIG_MISSING quando FLAGCHECK_API_URL não está definido', async () => {
      delete process.env.FLAGCHECK_API_URL
      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('CONFIG_MISSING')
      }
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('retorna CONFIG_MISSING quando FLAGCHECK_API_KEY não está definido', async () => {
      delete process.env.FLAGCHECK_API_KEY
      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('CONFIG_MISSING')
      }
    })
  })

  // ── Sucesso (maior de idade) ──────────────────────────────────────────────

  describe('sucesso — maior de idade', () => {
    it('retorna isAdult=true e method=flagcheck', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdult: true }),
      })

      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.isAdult).toBe(true)
        expect(result.data.method).toBe('flagcheck')
      }
    })

    it('envia cpfHash no body, não CPF em texto claro', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdult: true }),
      })

      await verifyAgeViaFlagCheck('123.456.789-09')

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.cpfHash).toBe('mock-hash-12345678909')
      expect(callBody.cpf).toBeUndefined()
    })

    it('envia Bearer token no header Authorization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdult: true }),
      })

      await verifyAgeViaFlagCheck('12345678909')

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBe('Bearer test-api-key-123')
    })
  })

  // ── Menor detectado ───────────────────────────────────────────────────────

  describe('menor detectado', () => {
    it('retorna MINOR_DETECTED quando isAdult=false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdult: false }),
      })

      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('MINOR_DETECTED')
      }
    })

    it('não faz retry quando menor é detectado (é resposta definitiva)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdult: false }),
      })

      await verifyAgeViaFlagCheck('12345678909')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  // ── Retry em erro 5xx ─────────────────────────────────────────────────────

  describe('retry em erro servidor', () => {
    it('retenta 1 vez após erro 500 e retorna sucesso na segunda tentativa', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isAdult: true }),
        })

      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('retorna UNAVAILABLE após 2 falhas 5xx consecutivas', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: false, status: 502 })

      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('UNAVAILABLE')
      }
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  // ── Erro 4xx (sem retry) ──────────────────────────────────────────────────

  describe('erro 4xx — sem retry', () => {
    it('retorna UNAVAILABLE imediatamente em erro 400 (sem retry)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 })

      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('UNAVAILABLE')
      }
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('faz retry em erro 429 (rate limit)', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isAdult: true }),
        })

      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  // ── Timeout / erro de rede ────────────────────────────────────────────────

  describe('timeout e erro de rede', () => {
    it('retenta após erro de rede e retorna sucesso na segunda tentativa', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isAdult: true }),
        })

      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('retorna UNAVAILABLE após 2 erros de rede consecutivos', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))

      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('UNAVAILABLE')
      }
    })

    it('retenta após AbortError (timeout) e retorna sucesso', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError')
      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isAdult: true }),
        })

      const result = await verifyAgeViaFlagCheck('12345678909')
      expect(result.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  // ── Normalização de CPF ───────────────────────────────────────────────────

  describe('normalização de CPF', () => {
    it('CPF com máscara produz o mesmo hash que CPF sem máscara', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ isAdult: true }),
      })

      await verifyAgeViaFlagCheck('123.456.789-09')
      const hash1 = JSON.parse(mockFetch.mock.calls[0][1].body).cpfHash

      await verifyAgeViaFlagCheck('12345678909')
      const hash2 = JSON.parse(mockFetch.mock.calls[1][1].body).cpfHash

      expect(hash1).toBe(hash2)
      expect(hash1).toBe('mock-hash-12345678909')
    })
  })

  // ── URL e endpoint ────────────────────────────────────────────────────────

  describe('endpoint correto', () => {
    it('chama {FLAGCHECK_API_URL}/verify via POST', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdult: true }),
      })

      await verifyAgeViaFlagCheck('12345678909')

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.flagcheck.test/v1/verify')
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
  })
})
