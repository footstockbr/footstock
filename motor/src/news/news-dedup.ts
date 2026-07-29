// ============================================================================
// FootStock Motor — Dedup de URLs de notícia (set Redis com TTL de 48h)
//
// Extraído de `RSSFetcher` no item 014 do loop
// 07-28-noticias-multi-time-linha-por-time. Motivo: a marca de "processado" é
// escrita pelo fetcher no ENFILEIRAMENTO, mas quem descobre que o item NÃO foi
// processado é o worker de classificação, lá na frente, quando o publisher
// falha ao gravar no banco. Os dois lados precisam da mesma chave, e nenhum dos
// dois deveria importar o outro só por causa dela (`RSSFetcher` arrasta
// `rss-parser`, Prisma e o pool de fallback).
//
// Critério 6 da seção 12: falha de banco não pode terminar com item marcado
// como processado.
// Rastreabilidade: INT-046, INT-048
// ============================================================================

import type Redis from 'ioredis'
import { logger } from '../utils/logger'

/** Set Redis das URLs já enfileiradas. */
export const NEWS_URLS_KEY = 'news:urls'

/** Janela de dedup. Passado o TTL, a mesma URL pode voltar a ser enfileirada. */
export const URL_TTL_SECONDS = 48 * 60 * 60

/** Marca a URL como processada (entra no set de dedup). */
export async function markAsProcessed(redis: Redis, url: string): Promise<void> {
  await redis.sadd(NEWS_URLS_KEY, url)
  await redis.expire(NEWS_URLS_KEY, URL_TTL_SECONDS)
}

/**
 * Desfaz a marca — a URL volta a ser elegível no próximo ciclo de fetch.
 *
 * Chamado quando o pipeline falha DEPOIS do enfileiramento e a notícia não
 * chegou ao banco. Sem isto, um erro de banco transitório apagava a notícia por
 * 48h em silêncio: ela estava no set de dedup, então nenhum ciclo seguinte a
 * traria de volta.
 *
 * Best-effort de propósito. Redis indisponível aqui é degradação (a notícia se
 * perde nesta janela, exatamente como antes), nunca motivo para derrubar o
 * worker que já está tratando um erro. O resultado fica no retorno para quem
 * quiser logar.
 */
export async function unmarkAsProcessed(redis: Redis, url: string): Promise<boolean> {
  try {
    await redis.srem(NEWS_URLS_KEY, url)
    return true
  } catch (err) {
    logger.warn(JSON.stringify({
      event: 'news_dedup_unmark_failed',
      url,
      error_message: (err as Error).message,
      note: 'URL segue marcada como processada; noticia so retorna apos o TTL de 48h',
    }))
    return false
  }
}
