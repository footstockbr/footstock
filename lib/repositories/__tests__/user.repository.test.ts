import { userRepository } from '../user.repository'
import { prisma } from '@/lib/prisma'

// Mock do Prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

describe('UserRepository', () => {
  const mockUser = {
    id: 'cuid_test_001',
    email: 'test@test.com',
    name: 'Test User',
    phone: null,
    cpfHash: 'abc123hash',
    birthDate: null,
    planType: 'JOGADOR' as const,
    adminRole: null,
    investorProfile: null,
    tourCompleted: false,
    favoriteClub: null,
    fsBalance: 10000 as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => jest.clearAllMocks())

  test('findById retorna usuário existente', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    const result = await userRepository.findById('cuid_test_001')
    expect(result).toEqual(mockUser)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'cuid_test_001' },
    })
  })

  test('findById retorna null para id inexistente', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)
    const result = await userRepository.findById('nao_existe')
    expect(result).toBeNull()
  })

  test('findByEmail retorna usuário pelo email', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    const result = await userRepository.findByEmail('test@test.com')
    expect(result).toEqual(mockUser)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@test.com' },
    })
  })

  test('findByCpfHash retorna null para hash inexistente', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)
    const result = await userRepository.findByCpfHash('hash_nao_cadastrado')
    expect(result).toBeNull()
  })

  test('updateBalance incrementa saldo com operação atômica', async () => {
    const updatedUser = { ...mockUser, fsBalance: 10500 as any }
    ;(prisma.user.update as jest.Mock).mockResolvedValue(updatedUser)
    const result = await userRepository.updateBalance('cuid_test_001', 500)
    expect(result.fsBalance).toBe(10500)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'cuid_test_001' },
      data: { fsBalance: { increment: 500 } },
    })
  })

  test('updateBalance com delta negativo debita saldo', async () => {
    const updatedUser = { ...mockUser, fsBalance: 9500 as any }
    ;(prisma.user.update as jest.Mock).mockResolvedValue(updatedUser)
    await userRepository.updateBalance('cuid_test_001', -500)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'cuid_test_001' },
      data: { fsBalance: { increment: -500 } },
    })
  })
})
