// ============================================================================
// FootStock - Politica de status de conta em sessao ja existente
// ----------------------------------------------------------------------------
// Decisao 2026-09-03 (entrevista AUQ + debate adversarial Codex). Contexto:
//
//   O login (src/lib/auth-credentials.ts) ja barra quem nao esta ACTIVE, mas
//   NENHUM ponto do runtime olhava `user.status` numa sessao JA EMITIDA. O cron
//   de expiracao (src/lib/jobs/subscription-expiry.ts) vira a conta para
//   SUSPENDED com o cookie do usuario ainda valido, entao ele seguia operando
//   ate o cookie morrer. Dois testes it.failing em tests/integration/security.test.ts
//   documentavam o buraco.
//
// Este modulo e a UNICA fonte de verdade da politica. Ele e puro (sem I/O, sem
// Prisma, sem next/headers) para poder ser testado em unidade e para nao poder
// divergir entre os TRES caminhos de autenticacao que existem no app (o terceiro
// so apareceu ao migrar as rotas, e e a razao pratica de a politica morar num
// modulo puro em vez de dentro de um deles):
//
//   - getAuthUser()  (src/lib/auth.ts)           -> 126 das 209 rotas de /api/v1
//   - withAuth()     (src/app/api/middleware.ts) ->  15 rotas
//   - getAuthUser()  (src/lib/auth/server.ts)    ->   8 rotas (homonimo, outro modulo)
//
// MODELO CANONICO (decisao Q1): a verdade sobre acesso e o enum `user.status`.
// `suspendedAt`/`suspensionReason` sao METADADOS da sancao (quando e por que),
// nunca o gate. Antes desta decisao a rota admin de suspensao gravava so os
// metadados e respondia `status: 'suspended'` sem suspender nada.
// ============================================================================

import { USER_STATUS } from '@/lib/enums'

/** Metodos HTTP que nao mutam estado. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Prefixos de rota que uma conta SUSPENDED continua podendo MUTAR.
 *
 * Decisao Q3: SUSPENDED e majoritariamente lapso de assinatura, e
 * `PlanService` religa a conta para ACTIVE quando o pagamento entra
 * (PlanService.ts:906 e :1234). Bloquear o proprio caminho de pagamento
 * mataria o fluxo de pagar-para-reativar, que e a saida projetada desse estado.
 *
 * Nao inclui trading (/orders, /positions) nem social (/forum, /leagues):
 * esses sao exatamente o que a suspensao existe para conter.
 */
const SUSPENDED_WRITE_ALLOWLIST = [
  '/api/v1/payments',
  '/api/v1/subscriptions',
  '/api/v1/users/me',
  '/api/v1/auth',
  '/api/v1/notifications',
  '/api/v1/push',
] as const

/** Codigos de wire (catalogo canonico: src/lib/constants/errors.ts). */
export const ACCOUNT_BLOCKED_CODES = {
  SUSPENDED: 'AUTH-014',
  BANNED: 'AUTH-015',
} as const

export type AccountStatusInput = {
  status?: string | null
  suspensionReason?: string | null
}

export type RequestShape = {
  /** Pathname da request. Ausente = contexto nao HTTP (job, teste direto). */
  pathname?: string | null
  /** Metodo HTTP. Ausente = tratado como mutacao (fail-closed). */
  method?: string | null
}

export type AccountRestriction = {
  code: string
  message: string
  httpStatus: 403
  /** Motivo humano da sancao, quando registrado pelo admin/moderacao. */
  reason: string | null
}

function isAllowlistedWrite(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return SUSPENDED_WRITE_ALLOWLIST.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Avalia se a conta pode seguir com ESTA request.
 *
 * @returns `null` quando liberado; a restricao (403 + codigo + motivo) quando barrado.
 *
 * Regras:
 * - ACTIVE (ou status ausente/desconhecido nao sancionado): libera.
 * - BANNED: barra TUDO, inclusive leitura. Banimento e terminal e so admin
 *   reverte (admin/users/[id]/ban/route.ts). Nao existe auto-servico de saida.
 * - SUSPENDED: barra mutacao fora da allowlist. Leitura segue liberada de
 *   proposito, para o usuario enxergar o proprio patrimonio enquanto decide
 *   se paga (decisao Q3, opcao "bloqueia escrita, libera pagamento").
 *
 * Fail-closed: `method` ausente conta como mutacao. Um chamador que nao sabe
 * dizer o que esta fazendo nao ganha o beneficio da duvida.
 */
export function evaluateAccountAccess(
  user: AccountStatusInput,
  request: RequestShape = {}
): AccountRestriction | null {
  const status = user.status ?? USER_STATUS.ACTIVE
  const reason = user.suspensionReason ?? null

  if (status === USER_STATUS.BANNED) {
    return {
      code: ACCOUNT_BLOCKED_CODES.BANNED,
      message: 'Conta banida. Entre em contato com o suporte.',
      httpStatus: 403,
      reason,
    }
  }

  if (status !== USER_STATUS.SUSPENDED) return null

  const method = (request.method ?? 'POST').toUpperCase()
  if (SAFE_METHODS.has(method)) return null
  if (isAllowlistedWrite(request.pathname)) return null

  return {
    code: ACCOUNT_BLOCKED_CODES.SUSPENDED,
    message: 'Conta suspensa. Regularize sua assinatura para voltar a operar.',
    httpStatus: 403,
    reason,
  }
}

/** Conveniencia booleana para callers que so querem saber se passa. */
export function isAccountBlocked(
  user: AccountStatusInput,
  request: RequestShape = {}
): boolean {
  return evaluateAccountAccess(user, request) !== null
}

/** Exportado para teste de censo: a allowlist e contrato, nao detalhe. */
export const __SUSPENDED_WRITE_ALLOWLIST = SUSPENDED_WRITE_ALLOWLIST
