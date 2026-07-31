/**
 * @jest-environment node
 */
import {
  decryptToken,
  encryptToken,
  serializeEncryptedToken,
} from '@/lib/news/llm-token-crypto'

describe('llm-token-crypto', () => {
  const prevEnc = process.env.ENCRYPTION_KEY
  const prevNews = process.env.NEWS_LLM_TOKEN_KEY

  beforeAll(() => {
    process.env.NEWS_LLM_TOKEN_KEY = 'a'.repeat(64) // 32 bytes hex
    delete process.env.ENCRYPTION_KEY
  })

  afterAll(() => {
    if (prevEnc === undefined) delete process.env.ENCRYPTION_KEY
    else process.env.ENCRYPTION_KEY = prevEnc
    if (prevNews === undefined) delete process.env.NEWS_LLM_TOKEN_KEY
    else process.env.NEWS_LLM_TOKEN_KEY = prevNews
  })

  it('encrypt/decrypt roundtrip', () => {
    const payload = encryptToken('sk-test-secret-value')
    expect(payload.iv).toBeTruthy()
    expect(payload.data).toBeTruthy()
    expect(payload.tag).toBeTruthy()
    expect(payload.data).not.toContain('sk-test')
    const plain = decryptToken(payload)
    expect(plain).toBe('sk-test-secret-value')
  })

  it('serialize/decrypt string form', () => {
    const payload = encryptToken('another-secret')
    const serialized = serializeEncryptedToken(payload)
    expect(serialized).not.toContain('another-secret')
    expect(decryptToken(serialized)).toBe('another-secret')
  })

  it('rejects empty token', () => {
    expect(() => encryptToken('')).toThrow(/vazio/)
  })
})
