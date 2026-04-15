import { prisma } from '@/lib/prisma'

// ─── Blocked words cache (module-level, 60s TTL) ─────────────────────────────
// Keeps DB round-trips off every forum POST and admin GET loop.
let _wordsCache: { words: string[]; expiresAt: number } | null = null

export function invalidateBlockedWordsCache(): void {
  _wordsCache = null
}

export async function fetchBlockedWords(): Promise<string[]> {
  const now = Date.now()
  if (_wordsCache && now < _wordsCache.expiresAt) return _wordsCache.words
  const rows = await prisma.blockedWord.findMany({ select: { word: true } })
  const words = rows.map((r) => r.word)
  _wordsCache = { words, expiresAt: now + 60_000 }
  return words
}

// ─── Pure content checker ─────────────────────────────────────────────────────

/**
 * Pure — no DB access.
 *
 * Uses lookbehind/lookahead so:
 *   - "pix" doesn't match "pixel"
 *   - "300%" matches "ganhe 300% hoje" (% is non-alnum → boundary OK)
 *   - "merda" doesn't match "amerda" (a is alnum → no boundary)
 */
export function checkContentAgainstWords(content: string, blockedWords: string[]): boolean {
  if (!content || blockedWords.length === 0) return false
  const lower = content.toLowerCase()
  for (const word of blockedWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, 'i')
    if (regex.test(lower)) return true
  }
  return false
}

// ─── DB-backed detection ──────────────────────────────────────────────────────

/**
 * Detect blocked words in post content using the DB-backed cache.
 * Throws on DB error — callers choose fail-open vs fail-closed policy.
 */
export async function autoDetectBlockedWords(content: string): Promise<boolean> {
  if (!content || content.length === 0) return false
  const words = await fetchBlockedWords() // throws on DB error
  return checkContentAgainstWords(content, words)
}

// ─── Moderation actions ───────────────────────────────────────────────────────

/**
 * Record moderation action in history
 */
export async function recordModerationAction(
  postId: string,
  moderatorId: string,
  action: 'APPROVED' | 'REMOVED' | 'FLAGGED' | 'PERMANENTLY_DELETED',
  reason?: string
) {
  try {
    await prisma.moderationAction.create({
      data: { postId, moderatorId, action, reason },
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
        moderator: { select: { id: true, name: true, email: true } },
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
      where: { post: { userId } },
      include: {
        moderator: { select: { id: true, name: true } },
        post: {
          select: { id: true, content: true, createdAt: true, isFlagged: true, isDeleted: true },
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
      where: { createdAt: { gte: since } },
      include: {
        moderator: { select: { id: true, name: true } },
        post: { select: { id: true, content: true, userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return actions
  } catch (error) {
    console.error('[moderation] Error getting recent actions:', error)
    return []
  }
}
