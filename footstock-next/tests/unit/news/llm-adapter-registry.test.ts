/**
 * @jest-environment node
 */
import {
  resolveAdapterByName,
  getAdapterBySlug,
  listNativeSeedProviders,
} from '@/lib/news/llm-adapter-registry'

describe('llm-adapter-registry', () => {
  it('resolve Kimi aliases', () => {
    expect(resolveAdapterByName('Kimi')?.slug).toBe('kimi')
    expect(resolveAdapterByName('kimi for coding')?.slug).toBe('kimi')
  })

  it('resolve Anthropic aliases', () => {
    expect(resolveAdapterByName('Anthropic')?.slug).toBe('anthropic')
    expect(resolveAdapterByName('claude')?.slug).toBe('anthropic')
  })

  it('rejects unknown adapter', () => {
    expect(resolveAdapterByName('OpenAI')).toBeNull()
    expect(resolveAdapterByName('')).toBeNull()
    expect(resolveAdapterByName('   ')).toBeNull()
  })

  it('lists native seeds', () => {
    const seeds = listNativeSeedProviders()
    expect(seeds.map((s) => s.slug).sort()).toEqual(['anthropic', 'kimi'])
  })

  it('getAdapterBySlug', () => {
    expect(getAdapterBySlug('kimi')?.defaultModel).toBeTruthy()
    expect(getAdapterBySlug('nope')).toBeNull()
  })
})
