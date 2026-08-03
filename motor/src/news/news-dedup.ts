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

import { createHash } from 'crypto'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'

/** Set Redis das URLs já enfileiradas. */
export const NEWS_URLS_KEY = 'news:urls'

/**
 * Set Redis das ASSINATURAS DE TÍTULO já enfileiradas.
 *
 * Existe porque dedup por URL não cobre o caso real observado em 2026-08-03: o
 * mesmo fato noticioso chegando por duas URLs diferentes (feed da home e feed
 * da editoria, ou a mesma matéria republicada com querystring de campanha)
 * gerava dois grupos distintos no admin, com o mesmo título.
 *
 * NÃO confundir com o modelo multi-time do M067: irmãos que compartilham
 * `group_id` são o MESMO fato desdobrado em uma linha por clube, de propósito,
 * e nascem de um único item de RSS. Este dedup age no ENFILEIRAMENTO, antes de
 * existir grupo algum, então não tem como colapsar irmãos.
 */
export const NEWS_TITLE_FINGERPRINTS_KEY = 'news:title-fingerprints'

/** Janela de dedup. Passado o TTL, a mesma URL pode voltar a ser enfileirada. */
export const URL_TTL_SECONDS = 48 * 60 * 60

/**
 * Assinatura canônica do título: minúsculas, sem acento, sem pontuação, espaços
 * colapsados, truncada em sha256/16.
 *
 * Só o título entra. A descrição varia entre fontes para o mesmo fato (uma
 * trunca em 140 chars, outra acrescenta "Leia mais"), e incluí-la faria duas
 * cópias do mesmo fato gerarem assinaturas distintas — que é justamente o que
 * este dedup existe para pegar.
 */
export function titleFingerprint(title: string): string {
  const canonical = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

/** Marca a URL como processada (entra no set de dedup). */
export async function markAsProcessed(redis: Redis, url: string): Promise<void> {
  await redis.sadd(NEWS_URLS_KEY, url)
  await redis.expire(NEWS_URLS_KEY, URL_TTL_SECONDS)
}

/** Marca a assinatura do título como processada. Mesma janela de TTL da URL. */
export async function markTitleAsProcessed(redis: Redis, title: string): Promise<void> {
  await redis.sadd(NEWS_TITLE_FINGERPRINTS_KEY, titleFingerprint(title))
  await redis.expire(NEWS_TITLE_FINGERPRINTS_KEY, URL_TTL_SECONDS)
}

/** `true` quando um título equivalente já foi enfileirado na janela. */
export async function isTitleDuplicate(redis: Redis, title: string): Promise<boolean> {
  const member = await redis.sismember(NEWS_TITLE_FINGERPRINTS_KEY, titleFingerprint(title))
  return member === 1
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
export async function unmarkAsProcessed(
  redis: Redis,
  url: string,
  title?: string,
): Promise<boolean> {
  try {
    await redis.srem(NEWS_URLS_KEY, url)
    // A assinatura do título precisa sair JUNTO: deixá-la no set faria a
    // retentativa da mesma notícia ser barrada pelo dedup de título mesmo com a
    // URL já liberada — trocando um bug de perda-por-48h por outro idêntico.
    if (title) {
      await redis.srem(NEWS_TITLE_FINGERPRINTS_KEY, titleFingerprint(title))
    }
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
