// ============================================================================
// Foot Stock — Validação de CPF/CNPJ
// Utilitário centralizado para validação de documentos brasileiros.
// Rastreabilidade: GAP-012, GAP-016 (auditoria module-25)
// ============================================================================

function calcDigitCpf(digits: string, factor: number): number {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    sum += parseInt(digits[i]!) * (factor - i)
  }
  const remainder = sum % 11
  return remainder < 2 ? 0 : 11 - remainder
}

export function validateCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1+$/.test(digits)) return false

  const d1 = calcDigitCpf(digits.slice(0, 9), 10)
  if (d1 !== parseInt(digits[9]!)) return false

  const d2 = calcDigitCpf(digits.slice(0, 10), 11)
  return d2 === parseInt(digits[10]!)
}

export function validateCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return false
  if (/^(\d)\1+$/.test(digits)) return false

  const calcDigit = (d: string, weights: number[]): number => {
    const sum = d.split('').reduce((acc, n, i) => acc + parseInt(n) * weights[i]!, 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  return (
    calcDigit(digits.slice(0, 12), w1) === parseInt(digits[12]!) &&
    calcDigit(digits.slice(0, 13), w2) === parseInt(digits[13]!)
  )
}

export function validateCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) return validateCpf(value)
  if (digits.length === 14) return validateCnpj(value)
  return false
}
