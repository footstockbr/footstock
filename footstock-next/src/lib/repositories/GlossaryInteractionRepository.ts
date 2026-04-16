// ============================================================================
// FootStock — GlossaryInteractionRepository
// Registro fire-and-forget de interações com o glossário (InfoIcons)
// Fonte: module-18/TASK-6/ST003
// ============================================================================

import { prisma } from '@/lib/prisma'

export class GlossaryInteractionRepository {
  async record(userId: string, termSlug: string): Promise<void> {
    await prisma.glossaryInteraction.create({
      data: { userId, termSlug },
    })
  }

  async countByUserInPeriod(userId: string, since: Date): Promise<number> {
    return prisma.glossaryInteraction.count({
      where: { userId, createdAt: { gte: since } },
    })
  }

  async countTotalByUser(userId: string): Promise<number> {
    return prisma.glossaryInteraction.count({ where: { userId } })
  }

  async findDistinctSlugsByUser(userId: string): Promise<string[]> {
    const rows = await prisma.glossaryInteraction.findMany({
      where: { userId },
      select: { termSlug: true },
      distinct: ['termSlug'],
    })
    return rows.map((r) => r.termSlug)
  }
}

export const glossaryInteractionRepository = new GlossaryInteractionRepository()
