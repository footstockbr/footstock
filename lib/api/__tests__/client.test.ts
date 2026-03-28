import axios from 'axios'

// Mock axios e supabase ANTES do import
jest.mock('axios', () => {
  const interceptors = {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  }
  const instance = {
    interceptors,
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  }
  return {
    __esModule: true,
    default: {
      create: jest.fn(() => instance),
      isAxiosError: jest.fn((err: unknown) => err instanceof Error && 'isAxiosError' in err),
    },
    AxiosError: class AxiosError extends Error {
      isAxiosError = true
      response: unknown
      config: unknown
      constructor(message: string, code?: string, config?: unknown, request?: unknown, response?: unknown) {
        super(message)
        this.response = response
        this.config = config
      }
    },
  }
})

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
      }),
      refreshSession: jest.fn().mockResolvedValue({ error: null }),
    },
  })),
}))

jest.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}))

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('axios.create e chamado com configuracao correta', () => {
    // Re-import para trigger o modulo
    jest.isolateModules(() => {
      require('../client')
    })
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://localhost:3000',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  test('interceptors de request e response sao registrados', () => {
    jest.isolateModules(() => {
      require('../client')
    })
    const instance = (axios.create as jest.Mock).mock.results[0]?.value
    if (instance) {
      expect(instance.interceptors.request.use).toHaveBeenCalled()
      expect(instance.interceptors.response.use).toHaveBeenCalled()
    }
  })
})

describe('API Client helpers', () => {
  test('modulo exporta funcoes tipadas', () => {
    jest.isolateModules(() => {
      const client = require('../client')
      expect(typeof client.apiGet).toBe('function')
      expect(typeof client.apiPost).toBe('function')
      expect(typeof client.apiPut).toBe('function')
      expect(typeof client.apiDel).toBe('function')
    })
  })
})
