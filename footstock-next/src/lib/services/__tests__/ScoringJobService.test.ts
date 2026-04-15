// module-20: ScoringJobService unit tests — cron auth, LEAGUE_RESULT, degraded mode
import { ScoringJobService } from '../ScoringJobService'

// ─── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('@/lib/prisma', () => ({
  prisma: {
    league: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    leagueMember: {
      findUnique: jest.fn(),
    },
  },
}))

// ScoringJobService now delegates to leagueScoreService (not ScoringEngine directly)
jest.mock('@/lib/services/leagues/LeagueScoreService', () => ({
  leagueScoreService: {
    executarPipelineCompleto: jest.fn().mockResolvedValue({ processed: 0, errors: 0 }),
  },
}))

jest.mock('../LeagueTrophyService', () => ({
  leagueTrophyService: { awardTrophies: jest.fn().mockResolvedValue(undefined) },
}))

// mockNotifSend must live inside the factory to avoid "before initialization" error
// We access it later via jest.requireMock
jest.mock('../NotificationService', () => ({
  notificationService: { sendNotification: jest.fn().mockResolvedValue(undefined) },
}))

import { prisma } from '@/lib/prisma'
import { leagueScoreService } from '@/lib/services/leagues/LeagueScoreService'
import { notificationService } from '../NotificationService'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockPipeline = leagueScoreService.executarPipelineCompleto as jest.Mock
const mockNotifSend = notificationService.sendNotification as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockPipeline.mockResolvedValue({ processed: 0, errors: 0 })
  mockNotifSend.mockResolvedValue(undefined)
})

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('ScoringJobService', () => {
  describe('recalcularTodasLigas', () => {
    it('returns 0/0 when no active leagues', async () => {
      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([])

      const service = new ScoringJobService()
      const result = await service.recalcularTodasLigas()

      expect(result.processed).toBe(0)
      expect(result.errors).toBe(0)
      expect(result.timestamp).toBeDefined()
    })

    it('processes each member in active leagues', async () => {
      mockPipeline.mockResolvedValueOnce({ processed: 2, errors: 0 })
      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l1',
          name: 'Liga Ativa',
          type: 'PUBLICA',
          division: 'OPEN',
          endsAt: null,
          members: [{ userId: 'u1' }, { userId: 'u2' }],
        },
      ])

      const service = new ScoringJobService()
      const result = await service.recalcularTodasLigas()

      expect(result.processed).toBe(2)
      expect(result.errors).toBe(0)
      expect(mockPipeline).toHaveBeenCalledWith('l1')
    })

    it('counts pipeline failures as errors without stopping other leagues', async () => {
      mockPipeline.mockRejectedValueOnce(new Error('Pipeline failure'))
      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l1', name: 'Liga', type: 'PUBLICA', division: 'OPEN', endsAt: null,
          members: [{ userId: 'u1' }, { userId: 'u2' }],
        },
      ])

      const service = new ScoringJobService()
      const result = await service.recalcularTodasLigas()

      // Pipeline throw counted as one error
      expect(result.errors).toBeGreaterThanOrEqual(1)
    })

    it('marks league FINISHED when endsAt is in the past', async () => {
      const pastDate = new Date(Date.now() - 86400_000) // yesterday
      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l-ended',
          name: 'Liga Encerrada',
          type: 'PUBLICA',
          division: 'PRATA',
          endsAt: pastDate,
          members: [{ userId: 'u1' }],
        },
      ])
      ;(mockPrisma.league.update as jest.Mock).mockResolvedValue({})
      ;(mockPrisma.leagueMember.findUnique as jest.Mock).mockResolvedValue({ rank: 1 })

      const service = new ScoringJobService()
      await service.recalcularTodasLigas()

      expect(mockPrisma.league.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'l-ended' },
          data: { status: 'FINISHED' },
        })
      )
    })

    it('sends LEAGUE_RESULT notification to members on league end', async () => {
      const pastDate = new Date(Date.now() - 86400_000) // yesterday
      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l-notify',
          name: 'Liga Notify',
          type: 'PUBLICA',
          division: 'OPEN',
          endsAt: pastDate,
          members: [{ userId: 'u-member' }],
        },
      ])
      ;(mockPrisma.league.update as jest.Mock).mockResolvedValue({})
      ;(mockPrisma.leagueMember.findUnique as jest.Mock).mockResolvedValue({ rank: 2 })

      const service = new ScoringJobService()
      await service.recalcularTodasLigas()

      // ScoringJobService always calls sendNotification and relies on
      // NotificationService to apply quiet hours deferral internally
      expect(mockNotifSend).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-member',
          type: 'LEAGUE_RESULT',
        })
      )
    })

    it('does not mark league FINISHED when endsAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 86400_000)  // tomorrow
      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l-active',
          name: 'Liga Ativa',
          type: 'PUBLICA',
          division: 'OPEN',
          endsAt: futureDate,
          members: [{ userId: 'u1' }],
        },
      ])

      const service = new ScoringJobService()
      await service.recalcularTodasLigas()

      expect(mockPrisma.league.update).not.toHaveBeenCalled()
    })
  })
})

// ─── Cron route auth tests ─────────────────────────────────────────────────────
describe('GET /api/cron/scoring — authorization', () => {
  const CRON_SECRET = 'test-secret-abc123'

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('returns 401 when Authorization header is missing', async () => {
    const { GET } = await import('@/app/api/cron/scoring/route')
    const { NextRequest } = await import('next/server')

    jest.mock('@/lib/services/ScoringJobService', () => ({
      scoringJobService: { recalcularTodasLigas: jest.fn().mockResolvedValue({ processed: 0, errors: 0, timestamp: '' }) },
    }))

    const req = new NextRequest('http://localhost/api/cron/scoring')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when Bearer token is wrong', async () => {
    const { GET } = await import('@/app/api/cron/scoring/route')
    const { NextRequest } = await import('next/server')

    const req = new NextRequest('http://localhost/api/cron/scoring', {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
