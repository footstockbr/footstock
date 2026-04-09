import { prisma } from '@/lib/prisma'

/**
 * Auto-detect blocked words in post content
 * Returns true if post contains any blocked words
 */
export async function autoDetectBlockedWords(content: string): Promise<boolean> {
  if (!content || content.length === 0) return false

  try {
    const blockedWords = await prisma.blockedWord.findMany({
      select: { word: true },
    })

    const lowerContent = content.toLowerCase()

    for (const { word } of blockedWords) {
      // Simple word boundary check
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
      if (regex.test(lowerContent)) {
        return true
      }
    }

    return false
  } catch (error) {
    console.error('[moderation] Error detecting blocked words:', error)
    return false
  }
}

/**
 * Record moderation action in history
 */
export async function recordModerationAction(
  postId: string,
  moderatorId: string,
  action: 'APPROVED' | 'REMOVED' | 'FLAGGED',
  reason?: string
) {
  try {
    await prisma.moderationAction.create({
      data: {
        postId,
        moderatorId,
        action,
        reason,
      },
    })
  } catch (error) {
    console.error('[moderation] Error recording action:', error)
  }
}

/**
 * Get moderation history for a specific post
 */
export async function getPostModerationHistory(postId: string) {
  try {
    const actions = await prisma.moderationAction.findMany({
      where: { postId },
      include: {
        moderator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return actions
  } catch (error) {
    console.error('[moderation] Error getting history:', error)
    return []
  }
}

/**
 * Get moderation history for a specific user
 */
export async function getUserModerationHistory(userId: string) {
  try {
    const actions = await prisma.moderationAction.findMany({
      where: {
        post: {
          userId,
        },
      },
      include: {
        moderator: {
          select: {
            id: true,
            name: true,
          },
        },
        post: {
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return actions
  } catch (error) {
    console.error('[moderation] Error getting user history:', error)
    return []
  }
}

/**
 * Get recent moderation actions for notifications
 */
export async function getRecentModerationActions(minutes = 5) {
  try {
    const since = new Date(Date.now() - minutes * 60 * 1000)

    const actions = await prisma.moderationAction.findMany({
      where: {
        createdAt: { gte: since },
      },
      include: {
        moderator: {
          select: {
            id: true,
            name: true,
          },
        },
        post: {
          select: {
            id: true,
            content: true,
            userId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return actions
  } catch (error) {
    console.error('[moderation] Error getting recent actions:', error)
    return []
  }
}
