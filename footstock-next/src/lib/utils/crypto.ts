import { createHash, createHmac, randomBytes } from 'crypto'

/**
 * Gera hash HMAC-SHA256 do CPF usando secret dedicado.
 * O CPF é normalizado (apenas dígitos) antes do hash.
 * NUNCA armazenar o CPF original — apenas o hash.
 *
 * MIGRAÇÃO (2026-04-05): SHA-256+salt → HMAC-SHA256.
 *   - Preferência: HMAC_CPF_SECRET (recomendado)
 *   - Fallback: CPF_HASH_SALT (legado, emite console.warn)
 *   - Se nenhum estiver configurado, lança erro.
 *
 * ATENÇÃO: Após migrar para HMAC_CPF_SECRET, os hashes gerados serão
 * DIFERENTES dos antigos com CPF_HASH_SALT. Planeje uma migração de
 * dados (re-hash) se já houver hashes persistidos no banco.
 *
 * @param cpf CPF em qualquer formato (com ou sem pontuação)
 * @returns Hash HMAC-SHA256 (ou SHA-256 legado) em hexadecimal lowercase (64 chars)
 *
 * @example
 * hashCPF('529.982.247-25') === hashCPF('52998224725') // true
 */
export function hashCPF(cpf: string): string {
  const normalizedCPF = cpf.replace(/\D/g, '')

  const hmacSecret = process.env.HMAC_CPF_SECRET
  if (hmacSecret) {
    return createHmac('sha256', hmacSecret).update(normalizedCPF).digest('hex')
  }

  // Fallback legado: SHA-256 + salt (backward compatibility)
  const salt = process.env.CPF_HASH_SALT
  if (!salt) throw new Error('CPF_HASH_SALT não configurado')

  console.warn(
    '[crypto] AVISO: Usando SHA-256+salt legado para hash de CPF. ' +
    'Configure HMAC_CPF_SECRET para migrar para HMAC-SHA256.'
  )
  return createHash('sha256').update(`${normalizedCPF}${salt}`).digest('hex')
}

/**
 * Gera hash SHA-256 genérico de uma string.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Gera token criptograficamente seguro.
 */
export function generateSecureToken(length = 32): string {
  return randomBytes(length).toString('hex')
}
