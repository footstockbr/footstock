// ============================================================================
// FootStock Motor — Dedup de URLs de notícia (chave individual com TTL de 48h)
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

/**
 * Convivencia T-15 (SET legado -> chave individual):
 *
 * - Leitura e unmark sao dual (chave nova OU membro do SET). Escrita nova so
 *   na chave individual. O SET legado deixa de receber sadd/expire a partir
 *   deste deploy, portanto o TTL residual dele deixa de ser renovado e o SET
 *   some sozinho no maximo em 48h.
 * - Limpeza: depois de uma janela URL_TTL_SECONDS sem sadd no SET,
 *   `DEL news:urls` e `DEL news:title-fingerprints` sao no-op se o expire ja
 *   os removeu. Se o operador quiser reabrir todas as URLs imediatamente,
 *   `DEL` agora (aceita o burst de duplicatas). Rollback: `git revert` do
 *   commit; as chaves `news:urls:*` orfas expiram sozinhas em ate 48h.
 * - Migracao no avistamento (markAsProcessed): SET NX EX vence + membro
 *   legado ainda presente => retorna duplicata e grava a chave nova. Nao
 *   exige script de backfill.
 */
/** Set Redis legado das URLs ja enfileiradas. Nao e a chave da marca nova. */
export const NEWS_URLS_KEY = 'news:urls'

/**
 * Set Redis legado das ASSINATURAS DE TÍTULO já enfileiradas.
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

/**
 * Janela de dedup por item. Cada URL (e cada fingerprint de titulo) expira 48h
 * apos a propria marcacao. Marcar B nao renova A; re-avistamento com NX nao
 * empurra o TTL. Passado o TTL daquela chave, a mesma URL pode voltar a ser
 * enfileirada.
 */
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

/** Chave individual da marca de URL. Prefixo derivado de NEWS_URLS_KEY. */
export function urlDedupKey(url: string): string {
  return `${NEWS_URLS_KEY}:${url}`
}

/** Chave individual da marca de titulo. Prefixo derivado de NEWS_TITLE_FINGERPRINTS_KEY. */
export function titleDedupKey(title: string): string {
  return `${NEWS_TITLE_FINGERPRINTS_KEY}:${titleFingerprint(title)}`
}

/**
 * Marca a URL como processada na chave individual (`SET NX EX`).
 *
 * `true` = esta chamada reivindicou a URL como nova.
 * `false` = duplicata (chave nova ja existia, ou SET NX venceu mas a URL ainda
 * esta no SET legado). No segundo caso a chave nova fica gravada (migracao no
 * avistamento) e a janela dessa URL passa a ser 48h a partir deste avistamento,
 * nao o TTL residual do SET. Aceito como convivencia T-15.
 *
 * Nao renova TTL em re-avistamento (`NX`). Nao chama expire no SET legado.
 */
export async function markAsProcessed(redis: Redis, url: string): Promise<boolean> {
  const key = urlDedupKey(url)
  const claimed = await redis.set(key, '1', 'EX', URL_TTL_SECONDS, 'NX')
  if (claimed !== 'OK') return false
  const legacy = await redis.sismember(NEWS_URLS_KEY, url)
  return legacy !== 1
}

/** Marca a assinatura do título como processada. Mesma janela de TTL da URL. */
export async function markTitleAsProcessed(redis: Redis, title: string): Promise<void> {
  await redis.set(titleDedupKey(title), '1', 'EX', URL_TTL_SECONDS, 'NX')
}

/** `true` quando um título equivalente já foi enfileirado na janela. */
export async function isTitleDuplicate(redis: Redis, title: string): Promise<boolean> {
  const fresh = await redis.exists(titleDedupKey(title))
  if (fresh === 1) return true
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
 * Dual-unmark: apaga a chave nova E o membro do SET legado, para URL e (se
 * `title` veio) para o fingerprint. Sem isso, um lado da convivencia continuaria
 * barrando a retentativa.
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
    await redis.del(urlDedupKey(url))
    await redis.srem(NEWS_URLS_KEY, url)
    // A assinatura do título precisa sair JUNTO: deixá-la no set faria a
    // retentativa da mesma notícia ser barrada pelo dedup de título mesmo com a
    // URL já liberada — trocando um bug de perda-por-48h por outro idêntico.
    if (title) {
      await redis.del(titleDedupKey(title))
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
