// ============================================================================
// FootStock Motor — NewsQueue
// Fila FIFO em memória para notícias aguardando classificação (máx 50 itens).
// Rastreabilidade: INT-046
// ============================================================================

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
}

export const newsQueue = new NewsQueue()
