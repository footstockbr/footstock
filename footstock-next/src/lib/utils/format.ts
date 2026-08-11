/**
 * Formatação monetária — BRL
 * Centralizado para evitar duplicação entre componentes admin.
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/**
 * Formata valor em moeda fictícia FS$ (FootStock)
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
 * Fuso canonico do produto — horario de Brasilia (GMT-3, sem DST desde 2019).
 *
 * TODA formatacao de data/hora exibida ao usuario DEVE passar por este fuso.
 * No servidor o container ja roda com TZ=America/Sao_Paulo, mas no browser o
 * fuso e o do dispositivo do usuario — sem `timeZone` explicito, um usuario
 * fora do Brasil (ou com relogio mal configurado) veria horarios errados e o
 * SSR divergiria do CSR. Por isso o fuso e sempre explicito.
 */
export const BR_TIMEZONE = 'America/Sao_Paulo' as const

/**
 * Formata data ISO para pt-BR curto: dd/mm/aa
 * Ex: "2026-04-09T..." → "09/04/26"
 */
export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * Formata data ISO para pt-BR longo: 09 de abril de 2026
 */
export function formatDateLong(date: Date | string): string {
  return new Date(date).toLocaleDateString('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Formata data+hora pt-BR: dd/mm/aa HH:mm
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: BR_TIMEZONE,
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Formata data com mes abreviado: "09 de abr. de 2026"
 * Usado em cartoes de plano, consentimentos e toasts de assinatura.
 */
export function formatDateMedium(date: Date | string): string {
  return new Date(date).toLocaleDateString('pt-BR', {
    timeZone: BR_TIMEZONE,
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

/**
 * Formata data+hora no estilo curto do Intl: "09/04/26 14:30"
 */
export function formatDateTimeShort(date: Date | string): string {
  return new Date(date).toLocaleString('pt-BR', {
    timeZone: BR_TIMEZONE,
    dateStyle: 'short', timeStyle: 'short',
  })
}

/**
 * Formata data+hora compacta sem ano: "09/04 14:30"
 * Usado em tabelas densas de admin (gateways, analise de valor).
 */
export function formatDateTimeCompact(date: Date | string): string {
  return new Date(date).toLocaleString('pt-BR', {
    timeZone: BR_TIMEZONE,
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Formata data+hora completa: "09/04/2026 14:30:15"
 */
export function formatDateTimeFull(date: Date | string): string {
  return new Date(date).toLocaleString('pt-BR', { timeZone: BR_TIMEZONE })
}

/**
 * Rotulo de eixo de grafico "dia/mes" — ex: "9/4"
 *
 * Substitui `${d.getDate()}/${d.getMonth() + 1}`, que resolvia no fuso do
 * dispositivo e deslocava o rotulo em um dia para quem estivesse fora do BRT.
 */
export function formatDayMonthLabel(date: Date | string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TIMEZONE, day: 'numeric', month: 'numeric',
  }).formatToParts(new Date(date))
  const day = parts.find(p => p.type === 'day')?.value ?? ''
  const month = parts.find(p => p.type === 'month')?.value ?? ''
  return `${day}/${month}`
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
