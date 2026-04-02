/**
 * @jest-environment node
 *
 * Testes de integração — POST /api/v1/auth/logout
 */

import { NextRequest } from 'next/server'

const mockGetUser = jest.fn()
const mockAdminSignOut = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
      admin: {
        signOut: mockAdminSignOut,
      },
    },
  })),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

function makeRequest(token?: string): NextRequest {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  return new NextRequest('http://localhost:3000/api/v1/auth/logout', {
    method: 'POST',
    headers,
  })
}

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockAdminSignOut.mockResolvedValue({ error: null })
  })

  test('sem token retorna 200 e remove cookie fs_dev_auth', async () => {
    const { POST } = await import('../logout/route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('fs_dev_auth=')
  })

  test('com token valido chama signOut admin e retorna 200', async () => {
    const { POST } = await import('../logout/route')
    const res = await POST(makeRequest('token-abc'))

    expect(res.status).toBe(200)
    expect(mockGetUser).toHaveBeenCalledWith('token-abc')
    expect(mockAdminSignOut).toHaveBeenCalledWith('user-123')
  })

  test('token invalido ainda retorna 200 e remove cookie', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid token' },
    })

    const { POST } = await import('../logout/route')
    const res = await POST(makeRequest('token-invalido'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(mockAdminSignOut).not.toHaveBeenCalled()

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('fs_dev_auth=')
  })
})

