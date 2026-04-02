// ============================================================================
// Testes — NewsQueue
// Rastreabilidade: INT-046
// ============================================================================

import { NewsQueue, type RawNewsItem } from '../NewsQueue'

const makeItem = (url: string): RawNewsItem => ({
  url,
  title: `Notícia ${url}`,
  source: 'ESPN Brasil',
  publishedAt: new Date().toISOString(),
})

describe('NewsQueue', () => {
  let queue: NewsQueue

  beforeEach(() => {
    queue = new NewsQueue()
  })

  test('[SUCCESS] enqueue retorna true e incrementa size', () => {
    const result = queue.enqueue(makeItem('http://a.com'))
    expect(result).toBe(true)
    expect(queue.size()).toBe(1)
    expect(queue.isEmpty()).toBe(false)
  })

  test('[SUCCESS — FIFO] dequeue retorna itens na ordem correta', () => {
    queue.enqueue(makeItem('http://a.com'))
    queue.enqueue(makeItem('http://b.com'))
    queue.enqueue(makeItem('http://c.com'))

    expect(queue.dequeue()?.url).toBe('http://a.com')
    expect(queue.dequeue()?.url).toBe('http://b.com')
    expect(queue.dequeue()?.url).toBe('http://c.com')
    expect(queue.size()).toBe(0)
  })

  test('[ERROR — Fila cheia] enqueue retorna false no MAX_SIZE+1', () => {
    for (let i = 0; i < NewsQueue.MAX_SIZE; i++) {
      queue.enqueue(makeItem(`http://item${i}.com`))
    }
    expect(queue.size()).toBe(NewsQueue.MAX_SIZE)

    const result = queue.enqueue(makeItem('http://overflow.com'))
    expect(result).toBe(false)
    expect(queue.size()).toBe(NewsQueue.MAX_SIZE)
  })

  test('[EDGE — Fila vazia] dequeue retorna undefined e isEmpty é true', () => {
    expect(queue.isEmpty()).toBe(true)
    expect(queue.dequeue()).toBeUndefined()
  })

  test('singleton newsQueue exportado', () => {
    const { newsQueue } = require('../NewsQueue')
    expect(newsQueue).toBeInstanceOf(NewsQueue)
  })
})
