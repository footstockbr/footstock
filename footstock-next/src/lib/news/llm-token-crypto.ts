// ============================================================================
// FootStock — News LLM token encryption (AES-256-GCM, versioned key)
// Token em repouso para providers de LLM do motor de noticias.
// NUNCA logar plaintext, ciphertext ou payloads brutos sensiveis.
// ============================================================================

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

export interface EncryptedTokenPayload {
  v: number
  iv: string
  data: string
  tag: string
}

function resolveKeyMaterial(): { key: Buffer; version: number } {
  // Preferencia: NEWS_LLM_TOKEN_KEY (hex 32 bytes). Fallback: ENCRYPTION_KEY (qualquer string min 32).
  const hexKey = process.env.NEWS_LLM_TOKEN_KEY
  if (hexKey) {
    const buf = Buffer.from(hexKey, 'hex')
    if (buf.length !== 32) {
      throw new Error('NEWS_LLM_TOKEN_KEY deve ter 64 caracteres hex (32 bytes)')
    }
    const version = Number(process.env.NEWS_LLM_TOKEN_KEY_VERSION ?? '1')
    return { key: buf, version: Number.isFinite(version) && version > 0 ? version : 1 }
  }

  const enc = process.env.ENCRYPTION_KEY
  if (enc && enc.length >= 32) {
    // Deriva 32 bytes estaveis de ENCRYPTION_KEY (nao armazenar o material bruto no payload).
    const key = createHash('sha256').update(enc, 'utf8').digest()
    const version = Number(process.env.NEWS_LLM_TOKEN_KEY_VERSION ?? '1')
    return { key, version: Number.isFinite(version) && version > 0 ? version : 1 }
  }

  throw new Error(
    'Chave de criptografia de token LLM ausente. Configure NEWS_LLM_TOKEN_KEY (openssl rand -hex 32) ou ENCRYPTION_KEY.',
  )
}

export function getTokenKeyVersion(): number {
  return resolveKeyMaterial().version
}

export function encryptToken(plaintext: string): EncryptedTokenPayload {
  if (!plaintext || !plaintext.trim()) {
    throw new Error('token vazio nao pode ser criptografado')
  }
  const { key, version } = resolveKeyMaterial()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const tag = cipher.getAuthTag()
  return {
    v: version,
    iv: iv.toString('base64'),
    data: encrypted,
    tag: tag.toString('base64'),
  }
}

export function decryptToken(payload: EncryptedTokenPayload | string): string {
  const parsed: EncryptedTokenPayload =
    typeof payload === 'string' ? (JSON.parse(payload) as EncryptedTokenPayload) : payload
  if (!parsed?.iv || !parsed?.data || !parsed?.tag) {
    throw new Error('payload de token invalido')
  }
  const { key } = resolveKeyMaterial()
  const iv = Buffer.from(parsed.iv, 'base64')
  const tag = Buffer.from(parsed.tag, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(parsed.data, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function serializeEncryptedToken(payload: EncryptedTokenPayload): string {
  return JSON.stringify(payload)
}

export function isEncryptedTokenPayload(value: unknown): value is EncryptedTokenPayload {
  if (!value || typeof value !== 'object') return false
  const v = value as EncryptedTokenPayload
  return (
    typeof v.v === 'number' &&
    typeof v.iv === 'string' &&
    typeof v.data === 'string' &&
    typeof v.tag === 'string'
  )
}
