// ============================================================================
// FootStock Motor — AES-256-GCM token decrypt (versioned key)
// Espelho de footstock-next/src/lib/news/llm-token-crypto.ts (somente decrypt no motor)
// ============================================================================

import { createDecipheriv, createHash } from 'node:crypto'

export interface EncryptedTokenPayload {
  v: number
  iv: string
  data: string
  tag: string
}

function resolveKey(): Buffer {
  const hexKey = process.env.NEWS_LLM_TOKEN_KEY
  if (hexKey) {
    const buf = Buffer.from(hexKey, 'hex')
    if (buf.length !== 32) {
      throw new Error('NEWS_LLM_TOKEN_KEY deve ter 64 caracteres hex (32 bytes)')
    }
    return buf
  }
  const enc = process.env.ENCRYPTION_KEY
  if (enc && enc.length >= 32) {
    return createHash('sha256').update(enc, 'utf8').digest()
  }
  throw new Error('Chave de criptografia de token LLM ausente no motor')
}

export function decryptToken(payload: EncryptedTokenPayload | string): string {
  const parsed: EncryptedTokenPayload =
    typeof payload === 'string' ? (JSON.parse(payload) as EncryptedTokenPayload) : payload
  if (!parsed?.iv || !parsed?.data || !parsed?.tag) {
    throw new Error('payload de token invalido')
  }
  const key = resolveKey()
  const iv = Buffer.from(parsed.iv, 'base64')
  const tag = Buffer.from(parsed.tag, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(parsed.data, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
