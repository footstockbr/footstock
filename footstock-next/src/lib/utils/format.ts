/**
 * Formatação monetária — BRL
 * Centralizado para evitar duplicação entre componentes admin.
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/**
 * Formata valor em moeda fictícia FS$ (Foot Stock)
 * Ex: 1234.5 → "FS$ 1.234,50"
 */
export function formatFS(value: number | null | undefined): string {
  if (value == null) return 'N/D'
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Formata percentual com sinal +/–
 * Ex: 2.5 → "+2,50%" | -1.2 → "-1,20%"
 */
export function formatPct(value: number | null | undefined): string {
  if (value == null) return 'N/D'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

/**
 * Formata percentual simples (sem sinal)
 * Ex: 15.5 → "15,50%"
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return 'N/D'
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

/**
 * Formata data ISO para pt-BR curto: dd/mm/aa
 * Ex: "2026-04-09T..." → "09/04/26"
 */
export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * Formata data ISO para pt-BR longo: 09 de abril de 2026
 */
export function formatDateLong(date: Date | string): string {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Formata data+hora pt-BR: dd/mm/aa HH:mm
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Formata moeda BRL a partir de centavos (divide por 100)
 * Ex: 1990 → "R$ 19,90"
 */
export function formatBRLFromCents(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)
}

/**
 * Formata valor FS$ SEM o prefixo "FS$" — para uso em templates onde o símbolo é adicionado manualmente.
 * Ex: `FS$${formatFSValue(val)}` → "FS$1.234,50"
 */
export function formatFSValue(value: number | null | undefined): string {
  if (value == null) return 'N/D'
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Formata valor numérico BRL SEM o prefixo "R$"
 * Útil em templates onde o símbolo é adicionado manualmente: `R$${formatBRLValue(val)}`
 * Ex: 1234.5 → "1.234,50"
 */
export function formatBRLValue(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(value)
    .replace('R$', '')
    .trim()
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
