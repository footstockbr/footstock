// ============================================================================
// Foot Stock — Formatacao de datas (PT-BR, timezone Sao Paulo)
// ============================================================================

const ptBRLocale = 'pt-BR'
const saoPauloTZ = 'America/Sao_Paulo'

/** Formata data como DD/MM/YYYY */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat(ptBRLocale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: saoPauloTZ,
  }).format(new Date(date))
}

/** Formata data e hora como DD/MM/YYYY HH:mm */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat(ptBRLocale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: saoPauloTZ,
  }).format(new Date(date))
}

/** Formata hora como HH:mm */
export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat(ptBRLocale, {
    hour: '2-digit', minute: '2-digit',
    timeZone: saoPauloTZ,
  }).format(new Date(date))
}

/** Formata como data relativa: "ha 5 minutos", "ontem", etc. */
export function formatRelativeDate(date: string | Date): string {
  const rtf = new Intl.RelativeTimeFormat(ptBRLocale, { numeric: 'auto' })
  const diff = (new Date(date).getTime() - Date.now()) / 1000

  if (Math.abs(diff) < 60) return rtf.format(Math.round(diff), 'second')
  if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (Math.abs(diff) < 2592000) return rtf.format(Math.round(diff / 86400), 'day')
  return formatDate(date)
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
  if (parts.length !== 3) return ''
  const dd = parts[0]!
  const mm = parts[1]!
  const yyyy = parts[2]!
  if (yyyy.length !== 4) return ''
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

/** Converte YYYY-MM-DD (ISO) → dd/mm/aaaa. Retorna '' se inválido. */
export function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return ''
  const [yyyy, mm, dd] = iso.split('-')
  if (!yyyy || !mm || !dd) return ''
  return `${dd}/${mm}/${yyyy}`
}

/** Calcula idade em anos */
export function calcAge(birthDate: string | Date): number {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}
