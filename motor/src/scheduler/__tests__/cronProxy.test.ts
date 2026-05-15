// ============================================================================
// Foot Stock Motor — Teste unitário do cronProxy (Option C)
// ============================================================================

import { cronProxy } from '../cronProxy'

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}))

const ORIGINAL_ENV = process.env

describe('cronProxy', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...ORIGINAL_ENV,
      FOOTSTOCK_NEXT_BASE_URL: 'http://next.test:3000',
      CRON_SECRET: 'secret-abc',
    }
    ;(global.fetch as jest.Mock | undefined)?.mockReset?.()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  test('faz GET autenticado para /api/cron/{job} e resolve em 2xx', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(cronProxy('scoring')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://next.test:3000/api/cron/scoring')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer secret-abc')
  })

  test('respeita apiVersion v1 e monta /api/v1/cron/{job}', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await cronProxy('nsm', { apiVersion: 'v1' })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://next.test:3000/api/v1/cron/nsm')
  })

  test('lanca erro em resposta nao-2xx (scheduler captura)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(cronProxy('dunning')).rejects.toThrow(/HTTP 503/)
  })

  test('lanca erro determinista se FOOTSTOCK_NEXT_BASE_URL ausente', async () => {
    delete process.env.FOOTSTOCK_NEXT_BASE_URL
    await expect(cronProxy('scoring')).rejects.toThrow(
      /FOOTSTOCK_NEXT_BASE_URL/
    )
  })

  test('lanca erro determinista se CRON_SECRET ausente', async () => {
    delete process.env.CRON_SECRET
    await expect(cronProxy('scoring')).rejects.toThrow(/CRON_SECRET/)
  })

  test('normaliza trailing slash em FOOTSTOCK_NEXT_BASE_URL', async () => {
    process.env.FOOTSTOCK_NEXT_BASE_URL = 'http://next.test:3000/'
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await cronProxy('bonus-credit')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://next.test:3000/api/cron/bonus-credit'
    )
  })
})
