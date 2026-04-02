// module-20: POST /api/v1/leagues — 10 unit test cases
import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
  hasPlan: jest.fn(),
}))

jest.mock('@/lib/repositories/LeagueRepository', () => ({
  leagueRepository: {
    findAll: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn(),
    addMember: jest.fn(),
  },
}))

import { getAuthUser, hasPlan } from '@/lib/auth'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { GET, POST } from '../route'
import { LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import { LeagueError } from '@/lib/errors/leagueErrors'

const mockGetAuthUser = getAuthUser as jest.Mock
const mockHasPlan     = hasPlan as jest.Mock
const mockCreate      = leagueRepository.create as jest.Mock
const mockAddMember   = leagueRepository.addMember as jest.Mock
const mockFindAll     = leagueRepository.findAll as jest.Mock
const mockFindByUser  = leagueRepository.findByUserId as jest.Mock

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const AUTH_JOGADOR = { user: { id: 'u1', name: 'Tester', planType: 'JOGADOR', email: 't@t.com' } }
const AUTH_CRAQUE  = { user: { id: 'u2', name: 'Craque',  planType: 'CRAQUE',  email: 'c@c.com' } }
const AUTH_LENDA   = { user: { id: 'u3', name: 'Lenda',   planType: 'LENDA',   email: 'l@l.com' } }

const LEAGUE_STUB = {
  id: 'league-1',
  name: 'Liga Teste',
  type: 'PUBLICA',
  division: 'ABERTA',
  duration: '1M',
  status: 'ACTIVE',
  slug: 'liga-teste',
  createdBy: 'u1',
}

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/leagues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeGetRequest(qs = '') {
  return new NextRequest(`http://localhost/api/v1/leagues${qs}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('POST /api/v1/leagues', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreate.mockResolvedValue(LEAGUE_STUB)
    mockAddMember.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mockGetAuthUser.mockResolvedValue(null)

    const res = await POST(makePostRequest({ name: 'Liga', type: 'PUBLICA', division: 'ABERTA', duration: '1M' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 on validation error (name too short)', async () => {
    mockGetAuthUser.mockResolvedValue(AUTH_JOGADOR)

    const res = await POST(makePostRequest({ name: 'AB', type: 'PUBLICA', division: 'ABERTA', duration: '1M' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns LEAGUE_050 when JOGADOR tries to create AMIGOS league', async () => {
    mockGetAuthUser.mockResolvedValue(AUTH_JOGADOR)
    mockHasPlan.mockReturnValue(false) // JOGADOR does not have CRAQUE

    const res = await POST(makePostRequest({ name: 'Liga Amigos', type: 'AMIGOS', division: 'ABERTA', duration: '1M' }))
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error.code).toBe(LEAGUE_ERRORS.PLAN_RESTRICTION.code)
  })

  it('returns LEAGUE_050 when CRAQUE tries to create PRO league', async () => {
    mockGetAuthUser.mockResolvedValue(AUTH_CRAQUE)
    // For PRO type: route only checks hasPlan(planType, 'LENDA') — CRAQUE does not have LENDA
    mockHasPlan.mockReturnValue(false)

    const res = await POST(makePostRequest({ name: 'Liga PRO', type: 'PRO', division: 'OURO', duration: '1M' }))
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error.code).toBe(LEAGUE_ERRORS.PLAN_RESTRICTION.code)
  })

  it('creates PUBLICA league for JOGADOR and adds creator as member', async () => {
    mockGetAuthUser.mockResolvedValue(AUTH_JOGADOR)
    mockHasPlan.mockReturnValue(true)

    const res = await POST(makePostRequest({ name: 'Liga Pública', type: 'PUBLICA', division: 'ABERTA', duration: '1M' }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.data.id).toBe('league-1')
    expect(mockAddMember).toHaveBeenCalledWith('league-1', 'u1')
  })

  it('creates AMIGOS league for CRAQUE', async () => {
    mockGetAuthUser.mockResolvedValue(AUTH_CRAQUE)
    mockHasPlan.mockReturnValue(true)

    const res = await POST(makePostRequest({ name: 'Liga Amigos', type: 'AMIGOS', division: 'PRATA', duration: '1S' }))

    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'AMIGOS', createdBy: 'u2' }))
  })

  it('creates PRO league for LENDA', async () => {
    mockGetAuthUser.mockResolvedValue(AUTH_LENDA)
    mockHasPlan.mockReturnValue(true)

    const res = await POST(makePostRequest({ name: 'Liga PRO', type: 'PRO', division: 'OURO', duration: 'TEMPORADA' }))

    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'PRO', createdBy: 'u3' }))
  })

  it('returns 422 when repository throws LeagueError FULL', async () => {
    mockGetAuthUser.mockResolvedValue(AUTH_JOGADOR)
    mockHasPlan.mockReturnValue(true)
    mockCreate.mockRejectedValue(new LeagueError(LEAGUE_ERRORS.FULL))

    const res = await POST(makePostRequest({ name: 'Liga Cheia', type: 'PUBLICA', division: 'ABERTA', duration: '1M' }))
    const json = await res.json()

    expect(res.status).toBe(422)
    expect(json.error.code).toBe(LEAGUE_ERRORS.FULL.code)
  })

  it('returns 500 on unexpected server error', async () => {
    mockGetAuthUser.mockResolvedValue(AUTH_JOGADOR)
    mockHasPlan.mockReturnValue(true)
    mockCreate.mockRejectedValue(new Error('Unexpected DB error'))

    const res = await POST(makePostRequest({ name: 'Liga Crash', type: 'PUBLICA', division: 'ABERTA', duration: '1M' }))

    expect(res.status).toBe(500)
  })
})

describe('GET /api/v1/leagues', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindAll.mockResolvedValue({ data: [LEAGUE_STUB], total: 1 })
    mockFindByUser.mockResolvedValue([LEAGUE_STUB])
  })

  it('returns 401 when not authenticated', async () => {
    mockGetAuthUser.mockResolvedValue(null)

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it('returns my leagues when userId=me', async () => {
    mockGetAuthUser.mockResolvedValue(AUTH_JOGADOR)

    const res = await GET(makeGetRequest('?userId=me'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(mockFindByUser).toHaveBeenCalledWith('u1')
    expect(Array.isArray(json.data)).toBe(true)
  })
})
