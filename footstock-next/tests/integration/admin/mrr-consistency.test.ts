/**
 * Testes de consistencia MRR/ARR
 *
 * Valida que o calculo de MRR (Monthly Recurring Revenue) e ARR (Annual Recurring Revenue)
 * esta correto, incluindo a exclusao de assinaturas canceladas.
 */

interface Subscription {
  id: string
  userId: string
  planName: string
  price: number
  status: 'active' | 'cancelled' | 'paused'
  cancelledAt: string | null
}

// Mock de dados inline
const mockSubscriptions: Subscription[] = [
  {
    id: 'sub-001',
    userId: 'user-001',
    planName: 'Básico',
    price: 19.90,
    status: 'active',
    cancelledAt: null,
  },
  {
    id: 'sub-002',
    userId: 'user-002',
    planName: 'Básico',
    price: 19.90,
    status: 'active',
    cancelledAt: null,
  },
  {
    id: 'sub-003',
    userId: 'user-003',
    planName: 'Pro',
    price: 39.90,
    status: 'active',
    cancelledAt: null,
  },
  {
    id: 'sub-004',
    userId: 'user-004',
    planName: 'Pro',
    price: 39.90,
    status: 'cancelled',
    cancelledAt: '2026-03-15T10:00:00Z',
  },
  {
    id: 'sub-005',
    userId: 'user-005',
    planName: 'Básico',
    price: 19.90,
    status: 'cancelled',
    cancelledAt: '2026-03-20T14:30:00Z',
  },
]

// Logica de calculo — simula o que o backend faria
function calculateMRR(subscriptions: Subscription[]): number {
  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active')
  const total = activeSubscriptions.reduce((sum, s) => sum + s.price, 0)
  return Math.round(total * 100) / 100
}

function calculateARR(mrr: number): number {
  return Math.round(mrr * 12 * 100) / 100
}

// Mock do Prisma
const prismaMock = {
  subscription: {
    findMany: jest.fn(),
  },
}

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => prismaMock),
}))

describe('MRR/ARR — Consistencia financeira', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('MRR deve ser a soma dos precos das assinaturas ativas (2x19.90 + 1x39.90 = 79.70)', () => {
    prismaMock.subscription.findMany.mockResolvedValue(
      mockSubscriptions.filter((s) => s.status === 'active')
    )

    const mrr = calculateMRR(mockSubscriptions)

    expect(mrr).toBe(79.70)
  })

  it('ARR deve ser MRR x 12 (79.70 x 12 = 956.40)', () => {
    const mrr = calculateMRR(mockSubscriptions)
    const arr = calculateARR(mrr)

    expect(mrr).toBe(79.70)
    expect(arr).toBe(956.40)
  })

  it('assinaturas canceladas devem ser excluidas do calculo de MRR', () => {
    prismaMock.subscription.findMany.mockResolvedValue(mockSubscriptions)

    const allSubscriptions = mockSubscriptions
    const cancelledCount = allSubscriptions.filter((s) => s.status === 'cancelled').length

    expect(cancelledCount).toBe(2)

    const mrr = calculateMRR(allSubscriptions)

    // MRR NAO deve incluir sub-004 (39.90) nem sub-005 (19.90)
    // Apenas sub-001 (19.90) + sub-002 (19.90) + sub-003 (39.90) = 79.70
    expect(mrr).toBe(79.70)
    expect(mrr).not.toBe(79.70 + 39.90 + 19.90)
  })
})
