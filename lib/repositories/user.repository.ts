import { prisma } from '@/lib/prisma'
import type { User, Prisma } from '@prisma/client'

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } })
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } })
  }

  async findByCpfHash(cpfHash: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { cpfHash } })
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data })
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({ where: { id }, data })
  }

  /**
   * Incrementa/decrementa saldo do usuário de forma atômica.
   * Use delta positivo para crédito, negativo para débito.
   */
  async updateBalance(id: string, delta: number): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { fsBalance: { increment: delta } },
    })
  }
}

export const userRepository = new UserRepository()
