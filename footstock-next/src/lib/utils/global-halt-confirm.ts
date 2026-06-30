// Validação pura da barreira de confirmação digitada para pausar/retomar o motor
// de mercado inteiro (HALT_ALL / RESUME_ALL). Extraída de MotorPageClient para
// permitir teste unitário sem DOM (ambiente node do jest deste repo). O limite de
// motivo (10..500) espelha o schema do backend (market/route.ts adminActionSchema
// reason z.string().min(10).max(500)); o valor validado é o que será enviado.

export type GlobalHaltFlow = 'halt' | 'resume'

export const REASON_MIN = 10
export const REASON_MAX = 500

// Token específico por fluxo: cada ação confirma com a própria palavra para evitar
// copy ambígua entre pausar e retomar (decisão canônica da spec do item 005).
const FLOW_TOKEN: Record<GlobalHaltFlow, string> = {
  halt: 'PAUSAR',
  resume: 'RETOMAR',
}

export function expectedToken(flow: GlobalHaltFlow): string {
  return FLOW_TOKEN[flow]
}

// O motivo enviado é o texto digitado com whitespace de borda removido; a validação
// incide sobre esse mesmo valor para garantir que o que chega na rota passa no schema.
export function normalizeReason(reason: string): string {
  return reason.trim()
}

export function isTokenValid(flow: GlobalHaltFlow, input: string): boolean {
  return input.trim() === expectedToken(flow)
}

export function isReasonValid(reason: string): boolean {
  const len = normalizeReason(reason).length
  return len >= REASON_MIN && len <= REASON_MAX
}

export interface GlobalHaltConfirmValidation {
  tokenOk: boolean
  reasonOk: boolean
  canSubmit: boolean
  tokenError: string | null
  reasonError: string | null
}

// Mensagens de erro por critério (Zero Silêncio): só aparecem quando o respectivo
// campo já recebeu conteúdo inválido; campo vazio não grita erro prematuro, mas
// também não habilita o submit.
export function validateGlobalHaltConfirm(
  flow: GlobalHaltFlow,
  token: string,
  reason: string
): GlobalHaltConfirmValidation {
  const tokenOk = isTokenValid(flow, token)
  const reasonOk = isReasonValid(reason)
  const reasonLen = normalizeReason(reason).length

  const tokenError =
    token.length > 0 && !tokenOk
      ? `Digite exatamente ${expectedToken(flow)} para confirmar.`
      : null

  let reasonError: string | null = null
  if (reason.length > 0 && !reasonOk) {
    reasonError =
      reasonLen < REASON_MIN
        ? `Motivo muito curto: mínimo de ${REASON_MIN} caracteres (atual ${reasonLen}).`
        : `Motivo muito longo: máximo de ${REASON_MAX} caracteres (atual ${reasonLen}).`
  }

  return {
    tokenOk,
    reasonOk,
    canSubmit: tokenOk && reasonOk,
    tokenError,
    reasonError,
  }
}
