import { createHash, randomBytes } from 'crypto'

/**
 * Gera hash SHA-256 do CPF concatenado com o salt.
 * O CPF é normalizado (apenas dígitos) antes do hash.
 * NUNCA armazenar o CPF original — apenas o hash.
 *
 * @param cpf CPF em qualquer formato (com ou sem pontuação)
 * @returns Hash SHA-256 em hexadecimal lowercase (64 chars)
 *
 * @example
 * hashCPF('529.982.247-25') === hashCPF('52998224725') // true
 */
export function hashCPF(cpf: string): string {
  const normalizedCPF = cpf.replace(/\D/g, '')
  const salt = process.env.CPF_HASH_SALT
  if (!salt) throw new Error('CPF_HASH_SALT não configurado')
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
