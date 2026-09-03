import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { forumRepository } from '@/lib/repositories/ForumRepository'
import { leagueEventRecorder } from '@/lib/services/leagues/LeagueEventRecorder'
import { ok, errors } from '@/lib/api'
import { getAuthUserOrBlock } from '@/lib/auth/require-active'

// POST /api/v1/forum/:id/like — toggle curtir/descurtir
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUserOrBlock()
  if ('response' in auth) return auth.response

  const { id } = await params

  try {
    const post = await forumRepository.findById(id)

    if (!post) {
      return errors.notFound('Post não encontrado.')
    }

    const { liked, count } = await forumRepository.toggleLike(id, auth.user.id)

    if (liked) {
      leagueEventRecorder.recordForAllActiveLeagues(post.userId, 'FORUM_POST_LIKED', { postId: id }).catch(() => {})
    }

    return ok({ liked, likes: count })
  } catch {
    return errors.server()
  }
}
