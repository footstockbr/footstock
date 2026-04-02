// ============================================================================
// Foot Stock — Bank Data Encryption (AES-256-GCM)
// Criptografia em repouso para dados bancários de afiliados e clubes parceiros.
// Rastreabilidade: TASK-3/ST003, US-037, GAP-001 (auditoria module-25)
// ============================================================================

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

function getKey(): Buffer {
  const key = process.env.BANK_CRYPTO_KEY
  if (!key) {
    throw new Error('BANK_CRYPTO_KEY não configurada. Gere com: openssl rand -hex 32')
  }
  const buf = Buffer.from(key, 'hex')
  if (buf.length !== 32) {
    throw new Error('BANK_CRYPTO_KEY deve ter 64 caracteres hex (32 bytes)')
  }
  return buf
}

export interface EncryptedPayload {
  iv: string
  data: string
  tag: string
}

export function encryptBankData(plaintext: Record<string, unknown>): EncryptedPayload {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const json = JSON.stringify(plaintext)
  let encrypted = cipher.update(json, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const tag = cipher.getAuthTag()

  return {
    iv: iv.toString('base64'),
    data: encrypted,
    tag: tag.toString('base64'),
  }
}

export function decryptBankData(payload: EncryptedPayload): Record<string, unknown> {
  const key = getKey()
  const iv = Buffer.from(payload.iv, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(payload.data, 'base64', 'utf8')
  decrypted += decipher.final('utf8')

  return JSON.parse(decrypted) as Record<string, unknown>
}
