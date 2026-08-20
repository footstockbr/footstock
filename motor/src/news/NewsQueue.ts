// ============================================================================
// FootStock Motor — NewsQueue
// Fila FIFO em memória para notícias aguardando classificação (máx 50 itens).
// Rastreabilidade: INT-046
// ============================================================================

import type Redis from 'ioredis'
import { unmarkAsProcessed } from './news-dedup'

/** Item bruto de notícia antes da classificação Sonnet */
export interface RawNewsItem {
  url: string
  title: string
  description?: string
  source: string
  publishedAt: string
}

export class NewsQueue {
  static readonly MAX_SIZE = 50
  private items: RawNewsItem[] = []

  /** Adiciona item ao final da fila. Retorna false se fila cheia (sem exceção). */
  enqueue(item: RawNewsItem): boolean {
    if (this.items.length >= NewsQueue.MAX_SIZE) {
      return false
    }
    this.items.push(item)
    return true
  }

  /** Remove e retorna o primeiro item (FIFO). Retorna undefined se vazia. */
  dequeue(): RawNewsItem | undefined {
    return this.items.shift()
  }

  size(): number {
    return this.items.length
  }

  isEmpty(): boolean {
    return this.items.length === 0
  }

  /**
   * Drena a fila em memoria: para cada item, desmarca a URL e o title
   * fingerprint no set de dedup Redis, liberando-os para o proximo ciclo.
   *
   * Chamado no shutdown do pipeline (T-13): sem isto, morte do processo
   * descarta os itens pendentes com as URLs ja marcadas — nenhum ciclo
   * seguinte os traz de volta em 48h, sem log.
   *
   * Best-effort: unmarkAsProcessed ja e best-effort internamente.
   */
  async drain(redis: Redis): Promise<{ drained: number; unmarked: number }> {
    const snapshot = [...this.items]
    let unmarked = 0
    for (const item of snapshot) {
      const ok = await unmarkAsProcessed(redis, item.url, item.title)
      if (ok) unmarked++
    }
    this.items.length = 0
    return { drained: snapshot.length, unmarked }
  }
}

export const newsQueue = new NewsQueue()
