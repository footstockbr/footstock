import { prisma } from '@/lib/prisma'
import { serializeUser } from '@/lib/auth'
import type { User, UpdateUserInput } from '@/types'

export class UserService {
  async findById(id: string): Promise<User | null> {
    // TODO: Implementar via /auto-flow execute
    const user = await prisma.user.findUnique({ where: { id } })
    return user ? serializeUser(user) : null
  }

  async update(id: string, data: UpdateUserInput): Promise<User> {
    // TODO: Implementar via /auto-flow execute
    const updated = await prisma.user.update({ where: { id }, data })
    return serializeUser(updated)
  }

  async requestDeletion(id: string): Promise<void> {
    // TODO: Implementar via /auto-flow execute
    // Anonimizar: email, name, phone, cpfHash, birthDate
    throw new Error('Not implemented — run /auto-flow execute')
  }

  async exportData(id: string): Promise<Record<string, unknown>> {
    // TODO: Implementar via /auto-flow execute
    throw new Error('Not implemented — run /auto-flow execute')
  }
}

export const userService = new UserService()
