/**
 * @jest-environment node
 */
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

jest.mock('../ScoringEngine', () => ({
  ScoringEngine: jest.fn().mockImplementation(() => ({
    calcularScore: jest.fn().mockResolvedValue({
      rentabilidade: 10, sofisticacao: 8, diversificacao: 6,
      consistencia: 4, bonusEducativo: 2, total: 30, finalScore: 30, fatorEquidade: 1.0,
    }),
    salvarScore: jest.fn().mockResolvedValue(undefined),
    recalcularRanks: jest.fn().mockResolvedValue(undefined),
  })),
}))

// mockNotifSend must live inside the factory to avoid "before initialization" error
// We access it later via jest.requireMock
jest.mock('../NotificationService', () => ({
  notificationService: { sendNotification: jest.fn().mockResolvedValue(undefined) },
}))

import { prisma } from '@/lib/prisma'
import { notificationService } from '../NotificationService'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockNotifSend = notificationService.sendNotification as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
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
      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l1',
          name: 'Liga Ativa',
          division: 'ABERTA',
          endsAt: null,
          createdBy: null,
          members: [{ userId: 'u1' }, { userId: 'u2' }],
        },
      ])

      const service = new ScoringJobService()
      const result = await service.recalcularTodasLigas()

      expect(result.processed).toBe(2)
      expect(result.errors).toBe(0)
    })

    it('counts individual member failures as errors without stopping', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ScoringEngine } = require('../ScoringEngine')
      ;(ScoringEngine as jest.Mock).mockImplementationOnce(() => ({
        calcularScore: jest.fn()
          .mockResolvedValueOnce({ rentabilidade: 10, sofisticacao: 5, diversificacao: 5, consistencia: 0, bonusEducativo: 0, total: 20, finalScore: 20, fatorEquidade: 1.0 })
          .mockRejectedValueOnce(new Error('Provider failure')),
        salvarScore: jest.fn().mockResolvedValue(undefined),
        recalcularRanks: jest.fn().mockResolvedValue(undefined),
      }))

      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l1', name: 'Liga', division: 'ABERTA', endsAt: null, createdBy: null,
          members: [{ userId: 'u1' }, { userId: 'u2' }],
        },
      ])

      const service = new ScoringJobService()
      const result = await service.recalcularTodasLigas()

      // One success, one failure counted as error
      expect(result.errors).toBeGreaterThanOrEqual(1)
    })

    it('marks league FINISHED when endsAt is in the past', async () => {
      const pastDate = new Date(Date.now() - 86400_000) // yesterday
      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l-ended',
          name: 'Liga Encerrada',
          division: 'PRATA',
          endsAt: pastDate,
          createdBy: 'u-owner',
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

    it('sends LEAGUE_RESULT notification to members on league end (outside quiet hours)', async () => {
      // Create pastDate BEFORE mocking global.Date (mock ignores constructor args)
      const pastDate = new Date('2024-06-14T12:00:00Z')

      // Force non-quiet hour: mock Date to 15h UTC (12h BRT)
      const realDate = global.Date
      const mockNow = new Date('2024-06-15T15:00:00Z')
      global.Date = jest.fn(() => mockNow) as unknown as typeof Date
      ;(global.Date as unknown as { now: () => number }).now = realDate.now

      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l-notify',
          name: 'Liga Notify',
          division: 'ABERTA',
          endsAt: pastDate,
          createdBy: null,
          members: [{ userId: 'u-member' }],
        },
      ])
      ;(mockPrisma.league.update as jest.Mock).mockResolvedValue({})
      ;(mockPrisma.leagueMember.findUnique as jest.Mock).mockResolvedValue({ rank: 2 })

      const service = new ScoringJobService()
      await service.recalcularTodasLigas()

      expect(mockNotifSend).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-member',
          type: 'LEAGUE_RESULT',
        })
      )

      global.Date = realDate
    })

    it('suppresses LEAGUE_RESULT notifications during BRT quiet hours (23h-7h)', async () => {
      // Create pastDate BEFORE mocking global.Date
      const pastDate = new Date('2024-06-14T12:00:00Z')

      // Force quiet hour: 02h UTC = 23h BRT
      const realDate = global.Date
      const mockNow = new Date('2024-06-15T02:30:00Z')
      global.Date = jest.fn(() => mockNow) as unknown as typeof Date
      ;(global.Date as unknown as { now: () => number }).now = realDate.now

      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l-quiet',
          name: 'Liga Quiet',
          division: 'ABERTA',
          endsAt: pastDate, // pastDate was created before mock, so it's a real past date
          createdBy: null,
          members: [{ userId: 'u-quiet' }],
        },
      ])
      ;(mockPrisma.league.update as jest.Mock).mockResolvedValue({})
      ;(mockPrisma.leagueMember.findUnique as jest.Mock).mockResolvedValue({ rank: 3 })

      const service = new ScoringJobService()
      await service.recalcularTodasLigas()

      expect(mockNotifSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'LEAGUE_RESULT' }))

      global.Date = realDate
    })

    it('does not mark league FINISHED when endsAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 86400_000) // tomorrow
      ;(mockPrisma.league.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l-active',
          name: 'Liga Ativa',
          division: 'ABERTA',
          endsAt: futureDate,
          createdBy: null,
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
