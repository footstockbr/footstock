import { deleteAccount } from '../account-deletion'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUpdate = jest.fn()
const mockDeleteMany = jest.fn()
const mockUpdateMany = jest.fn()
const mockCreate = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        user: { update: mockUpdate },
        notification: { deleteMany: mockDeleteMany },
        forumPost: { updateMany: mockUpdateMany },
        leagueMember: { deleteMany: mockDeleteMany },
        dataAccessLog: { create: mockCreate },
      })
    ),
  },
}))

const mockDeleteUser = jest.fn().mockResolvedValue({ error: null })
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { admin: { deleteUser: mockDeleteUser } },
  })),
}))

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('deleteAccount', () => {
  const userId = 'user-test-123'

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  it('deve retornar success = true', async () => {
    const result = await deleteAccount(userId, 'NOT_USING')
    expect(result.success).toBe(true)
    expect(result.anonymizedAt).toBeTruthy()
  })

  it('deve anonimizar email com padrão null@deleted-*.invalid', async () => {
    await deleteAccount(userId, 'PRIVACY_CONCERNS')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userId },
        data: expect.objectContaining({
          email: expect.stringMatching(/^null@deleted-[a-f0-9]{16}\.invalid$/),
          name: 'Usuário Deletado',
          phone: null,
          // birthDate e favoriteClub são NOT NULL no schema — usam placeholders
          birthDate: new Date('1900-01-01'),
          favoriteClub: 'DEL',
          adminRole: null,
          tourCompleted: false,
        }),
      })
    )
  })

  it('deve anonimizar cpfHash (diferente do userId original)', async () => {
    await deleteAccount(userId, 'OTHER')

    const updateCall = mockUpdate.mock.calls[0][0]
    expect(updateCall.data.cpfHash).toBeTruthy()
    expect(updateCall.data.cpfHash).not.toBe(userId)
    expect(updateCall.data.cpfHash).toHaveLength(64) // SHA-256 hex
  })

  it('deve deletar notificações e remover de ligas', async () => {
    await deleteAccount(userId, 'NOT_USING')

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId } })
  })

  it('deve anonimizar conteúdo de posts de fórum', async () => {
    await deleteAccount(userId, 'NOT_USING')

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId },
      data: { content: '[Conteúdo removido]' },
    })
  })

  it('deve chamar supabase.auth.admin.deleteUser com o userId', async () => {
    await deleteAccount(userId, 'NOT_USING')

    expect(mockDeleteUser).toHaveBeenCalledWith(userId)
  })

  it('não deve lançar erro se Supabase falhar (aceitar inconsistência temporária)', async () => {
    mockDeleteUser.mockRejectedValueOnce(new Error('Supabase offline'))

    await expect(deleteAccount(userId, 'NOT_USING')).resolves.toMatchObject({
      success: true,
    })
  })

  it('NÃO deve deletar dados financeiros (orders, positions, transactions) — LGPD obrigação 5 anos', async () => {
    await deleteAccount(userId, 'NOT_USING')

    // Verificar que nenhuma chamada deleteMany foi feita para orders, positions ou transactions
    const txFn = (await import('@/lib/prisma')).prisma.$transaction as jest.Mock
    const txCallback = txFn.mock.calls[0][0]

    // A transação recebe o mock tx — verificar que NÃO há order/position/transaction no mock
    // Os modelos financeiros NÃO devem ter deleteMany chamado
    const allDeleteManyCalls = mockDeleteMany.mock.calls
    const allDeleteManyContexts = allDeleteManyCalls.map(c => JSON.stringify(c))

    // Apenas notification e leagueMember devem ter deleteMany
    // orders, positions, transactions NÃO
    expect(allDeleteManyContexts.every(
      (ctx: string) => !ctx.includes('order') && !ctx.includes('position') && !ctx.includes('transaction')
    )).toBe(true)
  })

  it('deve fazer rollback se transação Prisma falhar', async () => {
    const { prisma } = await import('@/lib/prisma')
    ;(prisma.$transaction as jest.Mock).mockRejectedValueOnce(
      new Error('DB Error')
    )

    await expect(deleteAccount(userId, 'NOT_USING')).rejects.toThrow('DB Error')
  })
})
