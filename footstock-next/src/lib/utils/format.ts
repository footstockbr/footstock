/**
 * Formatação monetária — BRL
 * Centralizado para evitar duplicação entre componentes admin.
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/** Aplica máscara dd/mm/aaaa enquanto o usuário digita (remove não-dígitos automaticamente) */
export function maskDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** Converte dd/mm/aaaa → YYYY-MM-DD (ISO). Retorna '' se incompleto/inválido. */
export function displayToIso(display: string): string {
  const parts = display.split('/')
  if (parts.length !== 3 || parts[2].length !== 4) return ''
  const [dd, mm, yyyy] = parts
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

/** Converte YYYY-MM-DD (ISO) → dd/mm/aaaa. Retorna '' se inválido. */
export function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return ''
  const [yyyy, mm, dd] = iso.split('-')
  if (!yyyy || !mm || !dd) return ''
  return `${dd}/${mm}/${yyyy}`
}
