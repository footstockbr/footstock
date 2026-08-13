import { run, parseArgs, sanitizeId } from '../../scripts/reconcile-public-league-memberships'
import { leagueAutoEnrollService } from '@/lib/services/LeagueAutoEnrollService'

const mockFindManyLeagues = jest.fn()
const mockFindManyMembers = jest.fn()
let usersCallCount = 0

jest.mock('@/lib/prisma', () => ({
  prisma: {
    league: { findMany: (...args: unknown[]) => mockFindManyLeagues(...args) },
    user: {
      findMany: () => {
        usersCallCount++
        // Primeira pagina retorna usuarios; segunda (com cursor) retorna vazio.
        return Promise.resolve(usersCallCount === 1 ? [
          { id: 'user-1', planType: 'JOGADOR' },
          { id: 'user-2', planType: 'CRAQUE' },
          { id: 'user-3', planType: 'LENDA' },
          { id: 'user-4', planType: 'JOGADOR' },
        ] : [])
      },
    },
    leagueMember: { findMany: (...args: unknown[]) => mockFindManyMembers(...args) },
    $disconnect: jest.fn(),
  },
}))

jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({
  leagueAutoEnrollService: {
    enrollUserInPublicLeague: jest.fn(),
    getDivisionForPlan: jest.fn((plan: string) =>
      plan === 'JOGADOR' ? 'BRONZE' : plan === 'CRAQUE' ? 'PRATA' : 'OURO'
    ),
  },
}))

describe('reconcile-public-league-memberships', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    usersCallCount = 0
  })

  function setupLeagues() {
    mockFindManyLeagues.mockResolvedValue([
      { id: 'league-bronze', division: 'BRONZE' },
      { id: 'league-prata', division: 'PRATA' },
      { id: 'league-ouro', division: 'OURO' },
    ])
  }

  test('dry-run nao chama auto-enroll e reporta candidatos', async () => {
    setupLeagues()
    mockFindManyMembers.mockResolvedValue([{ userId: 'user-1' }])

    const summary = await run({ apply: false, json: false, batchSize: 100 })

    expect(summary.mode).toBe('DRY-RUN')
    expect(summary.scanned).toBe(4)
    expect(summary.alreadyMember).toBe(1)
    expect(summary.eligible).toBe(3)
    expect(summary.enrolled).toBe(0)
    expect(leagueAutoEnrollService.enrollUserInPublicLeague).not.toHaveBeenCalled()
    expect(summary.sample).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: sanitizeId('user-2'), planType: 'CRAQUE', division: 'PRATA' }),
      ])
    )
  })

  test('--apply executa auto-enroll e reporta contagens', async () => {
    setupLeagues()
    mockFindManyMembers.mockResolvedValue([])
    ;(leagueAutoEnrollService.enrollUserInPublicLeague as jest.Mock)
      .mockResolvedValueOnce({ status: 'ENROLLED', leagueId: 'league-bronze' })
      .mockResolvedValueOnce({ status: 'ENROLLED', leagueId: 'league-prata' })
      .mockResolvedValueOnce({ status: 'NO_ACTIVE_PUBLIC_LEAGUE' })
      .mockResolvedValueOnce({ status: 'ENROLLED', leagueId: 'league-bronze' })

    const summary = await run({ apply: true, json: false, batchSize: 100 })

    expect(summary.mode).toBe('APPLY')
    expect(summary.scanned).toBe(4)
    expect(summary.eligible).toBe(4)
    expect(summary.enrolled).toBe(3)
    expect(summary.noActiveLeague).toBe(1)
    expect(summary.failed).toBe(0)
    expect(leagueAutoEnrollService.enrollUserInPublicLeague).toHaveBeenCalledTimes(4)
  })

  test('--apply aborta no primeiro FAILED sem remover memberships', async () => {
    setupLeagues()
    mockFindManyMembers.mockResolvedValue([])
    ;(leagueAutoEnrollService.enrollUserInPublicLeague as jest.Mock)
      .mockResolvedValueOnce({ status: 'ENROLLED', leagueId: 'league-bronze' })
      .mockResolvedValueOnce({ status: 'FAILED', reason: 'db timeout' })
      .mockResolvedValueOnce({ status: 'ENROLLED', leagueId: 'league-ouro' })

    const summary = await run({ apply: true, json: false, batchSize: 100 })

    expect(summary.enrolled).toBe(1)
    expect(summary.failed).toBe(1)
    expect(leagueAutoEnrollService.enrollUserInPublicLeague).toHaveBeenCalledTimes(2)
  })

  test('parseArgs reconhece --apply, --json e --batch-size', () => {
    expect(parseArgs([])).toEqual({ apply: false, json: false, batchSize: 100 })
    expect(parseArgs(['--apply', '--json', '--batch-size', '50'])).toEqual({
      apply: true,
      json: true,
      batchSize: 50,
    })
  })

  test('sanitizeId mascara identificador', () => {
    expect(sanitizeId('user-1234567890abcdef')).toBe('user...cdef')
  })
})
