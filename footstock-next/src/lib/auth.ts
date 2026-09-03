import 'server-only'

import * as Sentry from '@sentry/nextjs'
import { cookies, headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { readAuthjsSession, isSessionInvalidated } from '@/lib/auth/authjs-session'
import {
  evaluateAccountAccess,
  type AccountRestriction,
} from '@/lib/auth/account-status'
import { isPaidFeature, type PlanFeature } from '@/lib/auth/planAccess'
import { shouldSuspendAccount, type SubscriptionForLogic } from '@/lib/services/plan-logic'
import { recordPaidFeatureGraceUsage } from '@/lib/observability/paid-feature-grace-counter'
import type { PlanType } from '@/lib/enums'
import type { User } from '@/types'

// Motivo pelo qual getAuthUser nao resolveu a sessao. Emitido como breadcrumb
// Sentry (sem PII) para dar visibilidade ao "logout fantasma" em RSC guardadas.
type AuthFailReason =
  | 'no-cookie-session'
  | 'user-not-found'
  | 'serialize-threw'
  | 'unexpected-throw'
  | 'session-invalidated'
  | 'account-blocked'

async function reportAuthFail(reason: AuthFailReason, err?: unknown): Promise<void> {
  // stdout SEMPRE (inclusive no-cookie-session) — canal de diagnostico que
  // aparece em `railway logs` quando o transport Sentry nao entrega em prod.
  // Sem PII: so o motivo e, quando ha erro, a message.
  console.warn(
    `[AUTH_FAIL] reason=${reason}${err instanceof Error ? ` err=${err.message}` : ''}`,
  )

  // 'no-cookie-session' e o caso NORMAL de visitante anonimo (ex: root page
  // chama /api/v1/auth/session a cada load deslogado). Emitir evento aqui
  // entupiria o Sentry. O sinal fino de "cookie presente mas nao resolveu"
  // ja e emitido como EVENTO dentro de readAuthjsSession (cookie-absent com
  // outros cookies / cookie-undecodable). Aqui fica so breadcrumb.
  // 'session-invalidated' e ESPERADO apos troca de senha (logout de outras
  // sessoes) — tratar como 'no-cookie-session': breadcrumb, sem evento Sentry.
  if (reason === 'no-cookie-session' || reason === 'session-invalidated') {
    Sentry.addBreadcrumb({
      category: 'auth',
      message: 'getAuthUser_unresolved',
      level: 'info',
      data: { reason },
    })
    return
  }

  // Casos genuinamente anormais e raros (id valido mas user sumiu, dado
  // corrompido, throw inesperado): emitir evento + flush, pois o caller faz
  // redirect(LOGIN) lançando NEXT_REDIRECT antes do transport enviar.
  if (err) {
    Sentry.captureException(err, { tags: { auth_fail_reason: reason } })
  } else {
    Sentry.captureMessage(`getAuthUser_unresolved:${reason}`, {
      level: 'warning',
      tags: { auth_fail_reason: reason },
    })
  }
  try {
    await Sentry.flush(2000)
  } catch {
    // flush best-effort — nunca bloquear o fluxo de auth por causa de telemetria.
  }
}

// ─── Higiene de cookies legados ────────────────────────────────────────────────
//
// Pós-decomissão Supabase: não há mais provider externo concorrente. Mantemos
// `clearDualCookies` para remover quaisquer cookies `sb-*` legados que tenham
// sobrado no browser, além dos cookies Auth.js no logout.

const AUTHJS_COOKIE_PREFIXES = [
  'next-auth.',
  '__Secure-next-auth.',
  '__Host-next-auth.',
  'authjs.',
  '__Secure-authjs.',
  '__Host-authjs.',
]
const SUPABASE_COOKIE_PREFIX = 'sb-'

/**
 * Limpa cookies de sessão Auth.js e cookies `sb-*` legados na resposta atual.
 *
 * Decisões de design:
 *  - NÃO chamamos NextAuth.signOut() apesar do spec literal mencioná-lo:
 *    o root `auth.ts` (handler) importa de `@/lib/auth` (este arquivo),
 *    invocar signOut() daqui criaria import cycle. Para session strategy
 *    'database', remover o cookie é funcionalmente equivalente —
 *    a Session row no DB fica órfã e expira via TTL natural do Adapter.
 *  - Prefix matching em vez de lista de nomes: tolerante a variações
 *    `__Secure-` / `__Host-` e `next-auth.` legacy vs `authjs.` v5+.
 *    Caso NextAuth introduza novo prefix em release futuro, atualizar
 *    `AUTHJS_COOKIE_PREFIXES` (lint via grep mensal sugerido).
 */
export async function clearDualCookies(): Promise<void> {
  const cookieStore = await cookies()
  for (const c of cookieStore.getAll()) {
    const name = c.name
    if (
      name.startsWith(SUPABASE_COOKIE_PREFIX) ||
      AUTHJS_COOKIE_PREFIXES.some((p) => name.startsWith(p))
    ) {
      try {
        cookieStore.delete(name)
      } catch {
        // Read-only context (RSC sem mutação) — tolerar; middleware fará a próxima limpeza.
      }
    }
  }
}

// ─── Obter usuário autenticado a partir da sessão Auth.js ──────────────────────
//
// Retorna o id canônico do usuário (Prisma) em `userId` e o usuário serializado.

// Le a rota/metodo que o middleware raiz injetou (src/middleware.ts). Fora de
// um request HTTP (job, script, teste chamando handler direto) nao ha header:
// devolve `{}`, e a politica trata isso como mutacao (fail-closed).
async function currentRequestShape(): Promise<{ pathname?: string; method?: string }> {
  try {
    const h = await headers()
    return {
      pathname: h.get('x-fs-path') ?? undefined,
      method: h.get('x-fs-method') ?? undefined,
    }
  } catch {
    return {}
  }
}

/**
 * Avalia a politica de conta bloqueada para um usuario ja resolvido.
 * Exportado para os callers que precisam do 403 real com motivo
 * (`getAuthUserOrBlock`, `withAuth`), em vez do 401 de backstop.
 */
export async function checkAccountAccess(user: {
  status?: string | null
  suspensionReason?: string | null
}): Promise<AccountRestriction | null> {
  return evaluateAccountAccess(user, await currentRequestShape())
}

// ----------------------------------------------------------------------------
// Politica de conta bloqueada dentro de getAuthUser (2026-09-03)
//
// Ate aqui NENHUM ponto do runtime olhava `user.status` numa sessao ja emitida.
// O login barra (src/lib/auth-credentials.ts:80), mas o cron de expiracao
// (src/lib/jobs/subscription-expiry.ts:112) vira a conta para SUSPENDED com o
// cookie do usuario ainda valido -- e ele seguia operando ate o cookie morrer.
//
// getAuthUser retorna `{user,userId} | null`, e null vira 401 nas 126 rotas que
// a chamam. Entao aqui o bloqueio e um BACKSTOP fail-closed: nega o acesso,
// mesmo que a resposta saia como 401 em vez do 403 decidido. Quem precisa do
// contrato completo (403 + codigo + motivo, cookie preservado) usa
// `getAuthUserOrBlock()` logo abaixo -- e e isso que as rotas de trading e
// social usam. `withAuth` (src/app/api/middleware.ts) tambem emite o 403 real.
// ----------------------------------------------------------------------------
export type AuthResolution =
  | { kind: 'ok'; user: User; userId: string }
  | { kind: 'blocked'; restriction: AccountRestriction }
  | { kind: 'anonymous' }

/**
 * Resolve a sessao E aplica a politica de conta bloqueada, preservando a razao
 * da negativa. Use quando a resposta precisa distinguir 401 (nao autenticado)
 * de 403 (autenticado, conta suspensa/banida) -- ver `getAuthUserOrBlock`.
 */
export async function resolveAuthUser(): Promise<AuthResolution> {
  try {
    // DEV local fallback: fs_dev_auth cookie em desenvolvimento.
    if (process.env.NODE_ENV !== 'production') {
      const cookieStore = await cookies()
      const devAuthRaw = cookieStore.get('fs_dev_auth')?.value
      const devAuthEmail = devAuthRaw ? decodeURIComponent(devAuthRaw) : null
      if (devAuthEmail) {
        const devUser = await prisma.user.findUnique({ where: { email: devAuthEmail } })
        if (devUser) {
          const restriction = await checkAccountAccess(devUser)
          if (restriction) {
            await reportAuthFail('account-blocked')
            return { kind: 'blocked', restriction }
          }
          return { kind: 'ok', userId: devUser.id, user: serializeUser(devUser) }
        }
      }
    }

    // Cookie de sessão Auth.js v5 `(__Secure-)authjs.session-token`.
    const authjs = await readAuthjsSession()
    if (authjs?.id) {
      const dbUser = await prisma.user.findUnique({ where: { id: authjs.id } })
      if (dbUser) {
        // Invalidacao de sessao: token emitido antes da ultima troca de senha
        // (logout de outras sessoes). dbUser ja foi buscado -> custo zero.
        if (isSessionInvalidated(dbUser.passwordChangedAt, authjs.iat)) {
          await reportAuthFail('session-invalidated')
          return { kind: 'anonymous' }
        }
        // Conta suspensa/banida numa sessao JA EMITIDA (2026-09-03). Antes disto
        // o cron de expiracao virava o status para SUSPENDED e o usuario seguia
        // operando ate o cookie morrer, porque nada no runtime lia `status`.
        const restriction = await checkAccountAccess(dbUser)
        if (restriction) {
          await reportAuthFail('account-blocked')
          return { kind: 'blocked', restriction }
        }
        try {
          return { kind: 'ok', userId: dbUser.id, user: serializeUser(dbUser) }
        } catch (err) {
          // serializeUser lancou (ex: Decimal nulo) — falha fechada, mas
          // distinguimos do "sem sessao" para nao mascarar dado corrompido.
          await reportAuthFail('serialize-threw', err)
          return { kind: 'anonymous' }
        }
      }
      // Cookie decodificou mas o id nao existe no DB (token de outro DB,
      // usuario deletado, ou troca de banco). Distinto de "sem cookie".
      await reportAuthFail('user-not-found')
      return { kind: 'anonymous' }
    }

    await reportAuthFail('no-cookie-session')
    return { kind: 'anonymous' }
  } catch (err) {
    await reportAuthFail('unexpected-throw', err)
    return { kind: 'anonymous' }
  }
}

/**
 * Compatibilidade: as 126 rotas que ja chamavam getAuthUser continuam vendo a
 * mesma assinatura. Conta bloqueada colapsa em `null`, o que vira 401 nessas
 * rotas -- backstop fail-closed. Para o 403 com motivo, usar
 * `getAuthUserOrBlock` (src/lib/auth/require-active.ts).
 */
export async function getAuthUser(): Promise<{ user: User; userId: string } | null> {
  const resolution = await resolveAuthUser()
  return resolution.kind === 'ok'
    ? { user: resolution.user, userId: resolution.userId }
    : null
}

// ─── FIX-09: instrumentar uso de feature paga pos-expiracao (graca preservada) ──
//
// Quando a assinatura JA EXPIROU mas ainda esta dentro da graca de 7 dias, o
// `planType` do usuario continua sendo o plano pago (o downgrade para JOGADOR so
// ocorre apos a graca, via cron `shouldDowngradeToJogador`). Logo o uso de feature
// paga nesse intervalo passa silencioso. Esta funcao torna esse uso OBSERVAVEL
// (metrica/log) SEM cortar acesso — decisao 2026-06-22 (manter graca + instrumentar).
//
// Fail-open: qualquer erro de telemetria/DB e engolido. NUNCA deve afetar o
// resultado de uma chamada de feature paga.

/**
 * Instrumenta o uso de uma feature paga durante a graca pos-expiracao.
 *
 * @returns true se o uso foi observado como pos-expiracao (dentro da graca);
 *          false caso contrario (assinatura ativa, sem graca, tier gratuito,
 *          assinatura ausente, ou erro engolido).
 */
export async function recordPaidFeatureUsage(params: {
  userId: string
  requiredPlan: PlanType
  feature?: PlanFeature
  /** Assinatura ja carregada pelo caller; quando ausente, e buscada aqui. */
  subscription?: SubscriptionForLogic | null
  now?: Date
}): Promise<boolean> {
  const { userId, requiredPlan, feature } = params
  const now = params.now ?? new Date()

  try {
    // Feature informada que NAO e paga: nada a instrumentar.
    if (feature && !isPaidFeature(feature)) return false
    // Sem feature, requiredPlan no tier gratuito: nada pago envolvido.
    if (!feature && requiredPlan === 'JOGADOR') return false

    // Carregar a assinatura mais recente quando o caller nao a forneceu.
    let sub = params.subscription ?? null
    if (!sub) {
      sub = (await prisma.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          planType: true,
          startsAt: true,
          expiresAt: true,
          status: true,
          cancelledAt: true,
          cancellationLockExpiresAt: true,
        },
      })) as SubscriptionForLogic | null
    }
    if (!sub) return false

    // Graca pos-expiracao = expirou mas ainda dentro dos 7 dias (status ACTIVE).
    if (!shouldSuspendAccount(sub, now)) return false

    const dimension = feature ?? `plan:${requiredPlan}`
    await recordPaidFeatureGraceUsage(dimension, {
      userId,
      plan: sub.planType,
      requiredPlan,
      feature: feature ?? null,
    })
    return true
  } catch {
    // fail-open: instrumentacao nunca quebra o caminho real de feature paga.
    return false
  }
}

// ─── Verificar se usuário tem adminRole mínimo ─────────────────────────────────
// Implementação em src/lib/utils/admin-roles.ts (sem server-only, seguro para client)
export { hasAdminRole } from '@/lib/utils/admin-roles'

// ─── Verificar se usuário tem plano mínimo ─────────────────────────────────────

const PLAN_LEVELS = { JOGADOR: 1, CRAQUE: 2, LENDA: 3 }

export function hasPlan(userPlan: string | null | undefined, required: 'JOGADOR' | 'CRAQUE' | 'LENDA'): boolean {
  if (!userPlan) return false
  return (PLAN_LEVELS[userPlan as keyof typeof PLAN_LEVELS] ?? 0) >=
    (PLAN_LEVELS[required] ?? 99)
}

// ─── Serialização — converte Prisma model para tipo de resposta ────────────────

export function serializeUser(dbUser: {
  id: string
  email: string
  name: string
  phone?: string | null
  birthDate: Date | null
  favoriteClub: string | null
  favoriteClubDisplayName?: string | null
  userType: string
  investorProfile: string | null
  planType: string | null
  fsBalance: { toNumber(): number } | null
  marginBlocked: { toNumber(): number } | null
  tourCompleted: boolean
  adminRole?: string | null
  version?: number
  createdAt: Date
  updatedAt: Date
}): User {
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    phone: dbUser.phone ?? null,
    birthDate: dbUser.birthDate?.toISOString().split('T')[0] ?? '',
    favoriteClub: dbUser.favoriteClub ?? '',
    favoriteClubDisplayName: dbUser.favoriteClubDisplayName ?? null,
    userType: dbUser.userType as User['userType'],
    investorProfile: (dbUser.investorProfile ?? 'INICIANTE') as User['investorProfile'],
    planType: (dbUser.planType ?? null) as User['planType'],
    fsBalance: dbUser.fsBalance?.toNumber() ?? 0,
    marginBlocked: dbUser.marginBlocked?.toNumber() ?? 0,
    tourCompleted: dbUser.tourCompleted,
    adminRole: (dbUser.adminRole as User['adminRole']) ?? null,
    version: dbUser.version ?? 0,
    createdAt: dbUser.createdAt.toISOString(),
    updatedAt: dbUser.updatedAt.toISOString(),
  }
}
