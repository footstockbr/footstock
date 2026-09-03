// ============================================================================
// FootStock Motor — session-transition (trilha de auditoria de sessao)
//
// Registra em `market_session_logs` cada mudanca de sessao do pregao virtual
// (PRE_OPENING -> TRADING -> CLOSING_CALL -> AFTER_MARKET -> CLOSED).
//
// HISTORICO (09-02). Ate aqui a trilha nao existia de fato:
//   - o job do motor (`scheduler/jobs/sessionTransition.ts`) era um stub que so
//     logava "Iniciando..." / "concluido (stub)" a cada minuto;
//   - o unico escritor real era uma rota Next (`/api/cron/session-transition`)
//     que NADA agendava, porque este repo nao tem vercel.json;
//   - a tabela nunca chegou a ser criada em producao (M073 cria).
// Zero linha, zero erro, zero sinal — a definicao de falha silenciosa.
//
// ESCRITOR UNICO. A rota Next foi removida junto com esta implementacao, de
// proposito: dois escritores, cada um com o seu proprio cache `previousSession`
// em memoria, registrariam a MESMA transicao duas vezes (cada processo observa a
// mudanca uma vez). Aqui o motor e o dono — ele ja e quem manda no pregao.
//
// IDEMPOTENCIA EM DUAS CAMADAS:
//   1. `market:session:previous` no Redis sobrevive a restart do motor (o cache
//      em memoria, sozinho, perde a transicao a cada deploy);
//   2. a chave natural (transition_day, from_session, to_session) no banco. Cada
//      transicao acontece no maximo uma vez por dia BRT, entao `skipDuplicates`
//      torna a escrita segura sob retry e sob um blip do Redis. Sem ela a unica
//      protecao seria o cache do processo — o mesmo modo de falha que a correcao
//      A5 do mesmo dia tirou do MarketEngine.
//
// ORDEM DAS ESCRITAS: banco primeiro, Redis depois. Se o banco falha, o cursor do
// Redis NAO avanca e a transicao e tentada de novo no minuto seguinte. O inverso
// (Redis primeiro) perderia a linha para sempre.
// ============================================================================

import type { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'
import { brtDayKey, sessionManager } from '../../engine/SessionManager'
import type { SessionType } from '../../types/motor.types'
import { logger } from '../../utils/logger'

/** Cursor durado da ultima sessao observada. Compartilhado com nada mais. */
export const PREVIOUS_SESSION_KEY = 'market:session:previous'
/** 24h: mais que o intervalo entre dois pregoes, sem residuo eterno. */
const PREVIOUS_SESSION_TTL_S = 86_400

export interface SessionTransitionDeps {
  prisma: Pick<PrismaClient, 'marketSessionLog'>
  redis: Pick<Redis, 'get' | 'set'>
  /** Sessao vigente no instante dado. Injetavel para teste determinístico. */
  getSession?: (at: Date) => SessionType
  now?: () => Date
}

export interface SessionTransitionResult {
  session: SessionType
  /** Houve mudanca em relacao a sessao anterior conhecida. */
  transitioned: boolean
  /** Uma linha nova foi gravada. `false` quando a chave natural ja existia. */
  logged: boolean
  /** Sessao anterior conhecida; `null` no primeiro ciclo apos um Redis vazio. */
  previous: SessionType | null
}

/**
 * Espelho em memoria do cursor. Evita um GET no Redis por minuto no caminho
 * feliz; NAO e a fonte da verdade (morre no restart, que e exatamente quando a
 * transicao precisa sobreviver).
 */
let cachedPrevious: SessionType | null = null

/** Somente para teste: zera o espelho em memoria entre casos. */
export function __resetSessionTransitionCache(): void {
  cachedPrevious = null
}

export async function runSessionTransition(
  deps: SessionTransitionDeps,
): Promise<SessionTransitionResult> {
  const now = (deps.now ?? (() => new Date()))()
  const getSession = deps.getSession ?? ((at: Date) => sessionManager.getCurrentSession(at))
  const session = getSession(now)

  if (cachedPrevious === null) {
    try {
      cachedPrevious = (await deps.redis.get(PREVIOUS_SESSION_KEY)) as SessionType | null
    } catch (err) {
      // Redis fora: seguimos com o cache do processo. O pior caso e nao registrar
      // uma transicao neste ciclo — nunca registrar uma errada.
      logger.warn(
        `[cron/session-transition] leitura de ${PREVIOUS_SESSION_KEY} falhou: ${String(err)}`,
      )
    }
  }

  const previous = cachedPrevious
  const transitioned = previous !== null && previous !== session

  let logged = false
  if (transitioned && previous !== null) {
    const transitionDay = brtDayKey(now)
    try {
      const created = await deps.prisma.marketSessionLog.createMany({
        data: [{ fromSession: previous, toSession: session, transitionAt: now, transitionDay }],
        skipDuplicates: true,
      })
      logged = created.count > 0
      logger.info(
        `[cron/session-transition] ${previous} -> ${session} (dia BRT ${transitionDay}, ` +
          `${logged ? 'registrada' : 'ja registrada'})`,
      )
    } catch (err) {
      // NAO avancamos o cursor: o proximo ciclo tenta de novo. Registrar a
      // transicao e auditoria, nao caminho critico do pregao — o erro e logado e
      // o motor segue.
      logger.error(
        `[cron/session-transition] falha ao gravar ${previous} -> ${session}: ${String(err)}`,
      )
      return { session, transitioned, logged: false, previous }
    }
  }

  cachedPrevious = session
  try {
    await deps.redis.set(PREVIOUS_SESSION_KEY, session, 'EX', PREVIOUS_SESSION_TTL_S)
  } catch (err) {
    logger.warn(
      `[cron/session-transition] escrita de ${PREVIOUS_SESSION_KEY} falhou — ` +
        `o cursor nao sobrevive a restart: ${String(err)}`,
    )
  }

  return { session, transitioned, logged, previous }
}
