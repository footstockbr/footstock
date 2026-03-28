// ============================================================================
// Foot Stock — Validadores (CPF, email, telefone, senha)
// ============================================================================

/** Valida email com regex basico */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Valida CPF com digitos verificadores (algoritmo modulo 11).
 * Aceita com ou sem pontuacao (xxx.xxx.xxx-xx ou xxxxxxxxxxx).
 */
export function validateCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '')
  if (cleaned.length !== 11) return false
  // Rejeita sequencias com todos os digitos iguais
  if (/^(\d)\1+$/.test(cleaned)) return false

  const calcDigit = (digits: string, factor: number): number => {
    let sum = 0
    for (const d of digits) {
      sum += parseInt(d, 10) * factor--
    }
    const rest = (sum * 10) % 11
    return rest === 10 || rest === 11 ? 0 : rest
  }

  const d1 = calcDigit(cleaned.slice(0, 9), 10)
  const d2 = calcDigit(cleaned.slice(0, 10), 11)
  return d1 === parseInt(cleaned[9]!, 10) && d2 === parseInt(cleaned[10]!, 10)
}

/** Valida telefone brasileiro (com ou sem DDD, 10 ou 11 digitos) */
export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '')
  return cleaned.length === 10 || cleaned.length === 11
}

/**
 * Valida senha com requisitos minimos:
 * - Minimo 8 caracteres
 * - Ao menos 1 letra maiuscula
 * - Ao menos 1 numero
 */
export function validatePassword(password: string): boolean {
  if (password.length < 8) return false
  if (!/[A-Z]/.test(password)) return false
  if (!/\d/.test(password)) return false
  return true
}

/** Formata CPF: 12345678901 => 123.456.789-01 */
export function formatCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, '')
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

/** Formata telefone: 11999999999 => (11) 99999-9999 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
}
