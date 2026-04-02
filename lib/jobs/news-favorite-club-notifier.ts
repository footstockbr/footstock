// ============================================================================
// Foot Stock — Job: NewsFavoriteClubNotifier
// Subscreve o canal Redis `news:inject` e dispara NEWS_FAVORITE_CLUB
// para usuários cujo clube favorito é afetado pela notícia.
//
// Boundary: o motor (Railway) não tem acesso ao serviço de notificações Next.js.
// Esta responsabilidade pertence ao module-19 (OVERVIEW module-17 §Impacto).
// Rastreabilidade: GAP-015 (module-17 MODULE-REVIEW), module-19 TASK-6
// ============================================================================

import { createSubscriber, REDIS_CHANNELS } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { sendNotification } from '@/lib/services/NotificationService'
import { normalizeClubTicker } from '@/lib/constants/clubs'

// ---------------------------------------------------------------------------
// Tipos do evento
// ---------------------------------------------------------------------------

interface NewsInjectEvent {
  type?: string
  assetId?: string      // ticker do ativo afetado (ex: 'URU3')
  impact?: string       // 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  magnitude?: number    // 0.0 a 1.0
  durationTicks?: number
}

// ---------------------------------------------------------------------------
// Notifier principal
// ---------------------------------------------------------------------------

/**
 * Inicializa o subscriber Redis para o canal `news:inject`.
 * Deve ser chamado UMA VEZ no startup do servidor (instrumentation.ts).
 * Não lança exceções — falhas são logadas e absorvidas.
 */
export function startNewsFavoriteClubNotifier(): void {
  const subscriber = createSubscriber()

  subscriber.subscribe(REDIS_CHANNELS.NEWS_INJECT).catch((err: Error) => {
    console.error('[NewsFavoriteClubNotifier] Falha ao subscrever canal news:inject:', err.message)
  })

  subscriber.on('message', (_channel: string, raw: string) => {
    void handleNewsEvent(raw)
  })

  subscriber.on('error', (err: Error) => {
    console.error('[NewsFavoriteClubNotifier] Erro no subscriber Redis:', err.message)
  })
}

// ---------------------------------------------------------------------------
// Handler interno
// ---------------------------------------------------------------------------

export async function handleNewsEvent(raw: string): Promise<void> {
  let event: NewsInjectEvent

  try {
    event = JSON.parse(raw) as NewsInjectEvent
  } catch {
    console.error('[NewsFavoriteClubNotifier] Payload JSON inválido:', raw.slice(0, 100))
    return
  }

  // Sem ticker: não há clube afetado
  if (!event.assetId) return

  const canonicalTicker = normalizeClubTicker(event.assetId)

  // Buscar o ativo correspondente ao ticker canônico
  const asset = await prisma.asset.findUnique({
    where: { ticker: canonicalTicker },
    select: { ticker: true, clubSlug: true },
  }).catch((err: Error) => {
    console.error(`[NewsFavoriteClubNotifier] Erro ao buscar asset ${canonicalTicker}:`, err.message)
    return null
  })

  if (!asset) return

  // Buscar usuários com este clube como favorito.
  // Compatibilidade: base antiga pode ter slug; base nova usa ticker canônico.
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { favoriteClub: canonicalTicker },
        { favoriteClub: asset.clubSlug },
      ],
    },
    select: { id: true },
  }).catch((err: Error) => {
    console.error(
      `[NewsFavoriteClubNotifier] Erro ao buscar usuários (ticker: ${canonicalTicker}, clubSlug: ${asset.clubSlug}):`,
      err.message
    )
    return []
  })

  if (users.length === 0) return

  const payload = {
    ticker: canonicalTicker,
    clubSlug: asset.clubSlug,
    impact: event.impact ?? 'NEUTRAL',
    magnitude: event.magnitude ?? 0,
  }

  // Disparar para todos — falha individual não impede os demais
  await Promise.allSettled(
    users.map((u) => sendNotification(u.id, 'NEWS_FAVORITE_CLUB', payload))
  )

  console.info(
    `[NewsFavoriteClubNotifier] ${users.length} notificação(ões) disparada(s) para ticker ${canonicalTicker} (clubSlug: ${asset.clubSlug})`
  )
}
