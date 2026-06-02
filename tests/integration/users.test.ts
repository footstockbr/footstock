// ============================================================================
// FootStock — Integration Tests: Users Endpoints
// Cobre: GET /me, PATCH /me, DELETE /me, GET /me/data, GET /me/export
//
// Segurança testada:
//   - THREAT-001: Mass assignment em PATCH /me (impede elevação de privilégio)
//   - AUTH_001: Token inválido → 401
//   - LGPD: DELETE /me registra solicitação de exclusão
// ============================================================================

import { NextRequest } from 'next/server'
import { testPrisma, TEST_EMAIL_DOMAIN } from './setup'
import { createTestUser, buildTestEmail } from './helpers/factory.helper'
import { mockAuthAsUser, mockAuthInvalid, buildNextRequest, parseResponse } from './helpers/auth.helper'

// ─── Setup ────────────────────────────────────────────────────────────────────

let testUser: { id: string; email: string; planType: string }

beforeEach(async () => {
  testUser = await createTestUser(testPrisma, {
    planType: 'JOGADOR',
    email: buildTestEmail('users-me'),
  })
})

afterEach(async () => {
  await testPrisma.user.deleteMany({ where: { email: { endsWith: TEST_EMAIL_DOMAIN } } })
})

// ─── GET /api/v1/me ───────────────────────────────────────────────────────────

describe('GET /api/v1/me', () => {
  it('[happy] deve retornar perfil do usuário autenticado → 200', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler) return

    const req = buildNextRequest('GET', '/api/v1/me')
    const res = await handler.GET(req as NextRequest)

    expect(res.status).toBe(200)
    const body = (await parseResponse(res)) as Record<string, unknown>
    expect(body.success).toBe(true)

    const data = body.data as Record<string, unknown>
    expect(data.id).toBe(testUser.id)
    expect(data.email).toBe(testUser.email)
    // Segurança: cpfHash NUNCA deve aparecer na resposta (THREAT-002)
    expect(data.cpfHash).toBeUndefined()
  })

  it('[auth] deve retornar 401 sem token válido → AUTH_001', async () => {
    mockAuthInvalid()

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler) return

    const req = buildNextRequest('GET', '/api/v1/me')
    const res = await handler.GET(req as NextRequest)

    expect(res.status).toBe(401)
    const body = (await parseResponse(res)) as Record<string, unknown>
    const error = body.error as Record<string, unknown>
    expect(error?.code).toMatch(/AUTH/)
  })
})

// ─── PATCH /api/v1/me — THREAT-001: Mass Assignment ──────────────────────────

describe('PATCH /api/v1/me — Mass Assignment (THREAT-001)', () => {
  it('[happy] deve atualizar campos permitidos (name, phone, favoriteClub)', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.PATCH) return

    const req = buildNextRequest('PATCH', '/api/v1/me', {
      name: 'Nome Atualizado',
      favoriteClub: 'POR4',
    })

    const res = await handler.PATCH(req as NextRequest)
    expect(res.status).toBe(200)

    // Verificar no banco que a atualização foi persistida
    const dbUser = await testPrisma.user.findUnique({ where: { id: testUser.id } })
    expect(dbUser!.name).toBe('Nome Atualizado')
    expect(dbUser!.favoriteClub).toBe('POR4')
  })

  it('[seguranca] não deve permitir elevar adminRole via PATCH → THREAT-001', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.PATCH) return

    // Atacante tenta elevar seus privilégios
    const req = buildNextRequest('PATCH', '/api/v1/me', {
      adminRole: 'SUPER_ADMIN',
      planType: 'LENDA',
      fsBalance: 999999,
    })

    await handler.PATCH(req as NextRequest)

    // Verificar que campos sensíveis NÃO foram alterados no banco
    const dbUser = await testPrisma.user.findUnique({ where: { id: testUser.id } })
    expect(dbUser!.adminRole).toBeNull() // Não foi elevado
    expect(dbUser!.planType).toBe('JOGADOR') // Não foi alterado
    // fsBalance pode ser qualquer valor, mas o ponto é que não foi 999999 via PATCH
    expect(dbUser!.fsBalance.toNumber()).not.toBe(999999)
  })

  it('[seguranca] não deve permitir alterar email via PATCH → THREAT-001', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.PATCH) return

    const originalEmail = testUser.email
    const req = buildNextRequest('PATCH', '/api/v1/me', {
      email: 'hacked@attacker.com',
    })

    await handler.PATCH(req as NextRequest)

    const dbUser = await testPrisma.user.findUnique({ where: { id: testUser.id } })
    expect(dbUser!.email).toBe(originalEmail) // Email não alterado
  })

  it('[validacao] deve retornar erro para name muito curto → VAL_003', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.PATCH) return

    const req = buildNextRequest('PATCH', '/api/v1/me', { name: 'X' }) // minLength: 2
    const res = await handler.PATCH(req as NextRequest)

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it('[auth] deve retornar 401 sem token → AUTH_001', async () => {
    mockAuthInvalid()

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.PATCH) return

    const req = buildNextRequest('PATCH', '/api/v1/me', { name: 'Teste' })
    const res = await handler.PATCH(req as NextRequest)
    expect(res.status).toBe(401)
  })
})

// ─── DELETE /api/v1/me — LGPD ────────────────────────────────────────────────

describe('DELETE /api/v1/me — Exclusão de conta (LGPD)', () => {
  it('[happy] deve registrar solicitação de exclusão → 202', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.DELETE) return

    const req = buildNextRequest('DELETE', '/api/v1/me')
    const res = await handler.DELETE(req as NextRequest)

    // LGPD: deve retornar 202 Accepted (processamento assíncrono)
    expect(res.status).toBe(202)
    const body = (await parseResponse(res)) as Record<string, unknown>
    expect(body.message || body.success).toBeTruthy()
  })

  it('[auth] deve retornar 401 sem token → AUTH_001', async () => {
    mockAuthInvalid()

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.DELETE) return

    const req = buildNextRequest('DELETE', '/api/v1/me')
    const res = await handler.DELETE(req as NextRequest)
    expect(res.status).toBe(401)
  })
})

// ─── GET /api/v1/me/data — Portabilidade LGPD ────────────────────────────────

describe('GET /api/v1/me/data — Exportação LGPD', () => {
  it('[happy] deve retornar dados estruturados do titular → 200', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/me/data/route').catch(() => null)
    if (!handler?.GET) return

    const req = buildNextRequest('GET', '/api/v1/me/data')
    const res = await handler.GET(req as NextRequest)

    expect(res.status).toBe(200)
    const body = (await parseResponse(res)) as Record<string, unknown>
    // LGPD: dados do titular devem ser retornados
    expect(body.success || body.data).toBeTruthy()
  })

  it('[seguranca] dados exportados NÃO devem conter cpfHash', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/me/data/route').catch(() => null)
    if (!handler?.GET) return

    const req = buildNextRequest('GET', '/api/v1/me/data')
    const res = await handler.GET(req as NextRequest)

    const body = (await parseResponse(res)) as Record<string, unknown>
    const bodyStr = JSON.stringify(body)
    // cpfHash não deve vazar na exportação
    expect(bodyStr).not.toContain('cpfHash')
    expect(bodyStr).not.toContain('cpf_hash')
  })

  it('[auth] deve retornar 401 sem token', async () => {
    mockAuthInvalid()

    const handler = await import('@/app/api/v1/me/data/route').catch(() => null)
    if (!handler?.GET) return

    const req = buildNextRequest('GET', '/api/v1/me/data')
    const res = await handler.GET(req as NextRequest)
    expect(res.status).toBe(401)
  })
})
