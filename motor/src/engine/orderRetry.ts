// ============================================================================
// FootStock Motor — ciclo de vida da retentativa de ordem (Fase 3, 2026-09-02)
//
// Antes desta fase, ordem que falhava na liquidacao voltava ao lote no tick
// seguinte para sempre: nada era gravado na linha, entao o motor nao tinha como
// saber que ja tinha tentado. Com `take` fixo e `orderBy createdAt asc`, uma
// unica ordem cronicamente ruim ficava na cabeca da fila e comia slot do lote em
// TODOS os ticks — as ordens novas atras dela nunca eram alcancadas.
//
// Este modulo e a fonte unica de tres decisoes que precisam ser identicas nos
// tres executores (MARKET/OrderExecutor, LIMIT+OCO/OrderMatcher e
// SCHEDULED/ScheduledOrderRunner):
//
//   1. QUAL falha conta como tentativa (classificacao por codigo, nunca por
//      substring de mensagem);
//   2. QUANDO a ordem volta a ser elegivel (backoff);
//   3. COMO a varredura filtra as inelegiveis (`eligibleNowFilter`), que tem de
//      ir no WHERE e nao em memoria depois do findMany — filtrar depois gastaria
//      o slot do lote com ordem em backoff, que e o defeito que a fase veio matar.
//
// Desenho completo: docs/FASE3-ciclo-de-vida-da-ordem.md
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import { logger } from '../utils/logger'
import { describeError } from './orderNotifications'

/** Tentativas FALHAS toleradas antes do cancelamento terminal. */
export const MAX_ATTEMPTS = 5

/**
 * Codigos considerados transitorios.
 *
 * P2034 e o write-conflict/deadlock que o Prisma levanta sob isolamento
 * Serializable; 40001 (serialization_failure) e 40P01 (deadlock_detected) sao os
 * SQLSTATE equivalentes quando o erro sobe cru do Postgres. Contencao e o estado
 * NORMAL deste motor sob volume — o proprio MarginCallChecker ja documenta a
 * estrategia "o proximo tick re-liquida".
 */
export const TRANSIENT_CODES: ReadonlySet<string> = new Set(['P2034', '40001', '40P01'])

/** Reagendamento das duas primeiras transitorias: praticamente o proximo tick. */
export const SHORT_BACKOFF_MS = 10_000
/** Base do exponencial para o que nao e transitorio (ou ja insistiu demais). */
export const BASE_BACKOFF_MS = 60_000
/** Teto do exponencial. Cinco tentativas cabem em menos de uma hora. */
export const MAX_BACKOFF_MS = 15 * 60_000

/**
 * Extrai um codigo curto e ESTAVEL do erro.
 *
 * Nunca retorna a mensagem: o texto do Prisma muda de formato entre versoes,
 * quebra dump de log (foi por isso que `describeError` existe) e pode carregar
 * dado de linha. Quem precisa do stack tem o log estruturado, indexado por
 * orderId.
 */
export function errorCodeOf(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code
  // Erro cru do driver: o SQLSTATE vem em `code` com 5 caracteres alfanumericos.
  const raw = (err as { code?: unknown } | null | undefined)?.code
  if (typeof raw === 'string' && /^[0-9A-Z]{5}$/.test(raw)) return raw
  return 'UNKNOWN'
}

export function isTransient(code: string): boolean {
  return TRANSIENT_CODES.has(code)
}

/**
 * Espera ate a proxima tentativa, em ms.
 *
 * `attempt` e o contador JA incrementado (1 = primeira falha).
 *
 * Transitoria nas duas primeiras ocorrencias volta no proximo tick: se contencao
 * consumisse o orcamento de tentativas com backoff longo, um pico de volume
 * (lancamento de noticia, por exemplo) converteria em cancelamento em massa o que
 * deveria ser apenas fila lenta.
 */
export function backoffMs(attempt: number, code: string): number {
  if (isTransient(code) && attempt <= 2) return SHORT_BACKOFF_MS
  const steps = isTransient(code) ? attempt - 2 : attempt
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, steps - 1), MAX_BACKOFF_MS)
}

/**
 * Fragmento de WHERE que seleciona apenas ordens elegiveis agora.
 *
 * `nextAttemptAt IS NULL` significa "nunca falhou" — e o estado de toda a base
 * historica, entao o `OR` nao e defensivo, e obrigatorio: sem ele a migration
 * teria removido a base inteira da varredura.
 */
export function eligibleNowFilter(now: Date) {
  return { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }
}

/**
 * Ordenacao das varreduras: FIFO, mas sem deixar ordem recem-reativada atras de
 * ordem antiga elegivel. Como o lote roda em `Promise.allSettled`, a ordem DENTRO
 * do tick e irrelevante; o que este orderBy governa e a composicao do lote.
 */
export const RETRY_ORDER_BY = [
  { nextAttemptAt: 'asc' as const },
  { createdAt: 'asc' as const },
]

export interface AttemptOutcome {
  /** Contador ja incrementado. */
  attemptCount: number
  /** Codigo curto gravado em last_error_code. */
  code: string
  /** true quando o contador atingiu MAX_ATTEMPTS: o caller deve cancelar. */
  exhausted: boolean
  /** null quando esgotado (nao ha proxima). */
  nextAttemptAt: Date | null
}

/**
 * Contabiliza UMA falha de execucao na propria ordem.
 *
 * So deve ser chamado para falha real de liquidacao. NAO chamar para:
 * ticker ausente de `currentPrices` (precondicao, nao falha — a causa raiz e o
 * `loadAssets()` que so roda no boot), ativo em halt (ja tem terminal proprio) e
 * ALREADY_SETTLED/INSUFFICIENT_BALANCE (a settlement ja decidiu). Contar
 * precondicao como falha cancelaria ordem perfeitamente sa por
 * EXECUTION_RETRY_EXHAUSTED — e o risco numero um desta fase.
 *
 * Nunca lanca: o registro do backoff nao pode derrubar o processamento do lote.
 * Se a escrita falhar, devolve o desfecho calculado com `exhausted: false` para
 * que o caller NAO cancele uma ordem cujo contador nao foi persistido.
 */
export async function recordFailedAttempt(
  prisma: PrismaClient,
  logPrefix: string,
  order: { id: string; attemptCount: number },
  err: unknown,
  now: Date,
): Promise<AttemptOutcome> {
  const code = errorCodeOf(err)
  const attemptCount = (order.attemptCount ?? 0) + 1
  const exhausted = attemptCount >= MAX_ATTEMPTS
  const nextAttemptAt = exhausted ? null : new Date(now.getTime() + backoffMs(attemptCount, code))

  try {
    // CAS pelo status: se a ordem virou terminal na janela (fill concorrente,
    // cancelamento pelo usuario), nao ha tentativa a contabilizar.
    const claim = await prisma.order.updateMany({
      where: { id: order.id, status: { in: ['OPEN', 'PARTIAL'] } },
      data: { attemptCount, lastAttemptAt: now, lastErrorCode: code, nextAttemptAt },
    })
    if (claim.count !== 1) {
      return { attemptCount, code, exhausted: false, nextAttemptAt }
    }
  } catch (writeErr) {
    logger.error(
      `[${logPrefix}] ATTEMPT_WRITE_FAIL orderId=${order.id} attempt=${attemptCount} ${describeError(writeErr)}`
    )
    // Sem contador persistido nao se cancela: o cancelamento por esgotamento tem
    // de ser consequencia de estado gravado, nunca de estado so em memoria.
    return { attemptCount, code, exhausted: false, nextAttemptAt }
  }

  logger.warn(
    `[${logPrefix}] ATTEMPT orderId=${order.id} attempt=${attemptCount}/${MAX_ATTEMPTS} errCode=${code} transient=${isTransient(code)} nextAttemptAt=${nextAttemptAt?.toISOString() ?? 'none'}`
  )
  return { attemptCount, code, exhausted, nextAttemptAt }
}

/** Motivo terminal gravado quando o orcamento de tentativas acaba. */
export const CANCEL_REASON_RETRY_EXHAUSTED = 'EXECUTION_RETRY_EXHAUSTED'
/** Motivo terminal da perna OCO derrubada junto com a irma. */
export const CANCEL_REASON_OCO_SIBLING = 'OCO_SIBLING'

interface ExhaustedLeg {
  id: string
  userId: string
  side: string
  quantity: number
  ticker: string
}

/**
 * Cancela terminalmente a ordem cujo orcamento de tentativas acabou.
 *
 * Tres invariantes, todas herdadas de defeitos que este repo ja pagou:
 *
 * - CAS por status: a ordem pode ter liquidado ou sido cancelada pelo usuario na
 *   janela entre a falha e este cancelamento. `count !== 1` significa que outro
 *   caminho ganhou, e entao NAO ha cancelamento nem aviso.
 * - Pernas OCO lidas DENTRO da transacao e com o MESMO filtro de status do
 *   update. O job de expiracao ja teve que corrigir exatamente isto: perna irma
 *   ja FILLED recebia "ordem cancelada", que com aviso duravel viraria mentira na
 *   caixa do usuario.
 * - Aviso FORA da transacao e idempotente por chave. A chave
 *   `motor:order_cancelled:retry_exhausted:{id}` e disjunta da do expiry
 *   (`expiry:order:{id}`) e da reconciliacao — a UNIQUE e rede de seguranca
 *   contra duplicata, nao a regra.
 *
 * Nunca lanca.
 */
export async function cancelExhaustedOrder(
  prisma: PrismaClient,
  logPrefix: string,
  order: { id: string; userId: string; side: string; quantity: number; groupId: string | null; asset: { ticker: string } },
  persist: (input: {
    userId: string
    type: 'ORDER_CANCELLED'
    idempotencyKey: string
    title: string
    body: string
    data: Record<string, unknown>
  }) => Promise<void>,
): Promise<void> {
  let cancelled: ExhaustedLeg[] = []

  try {
    cancelled = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claim = await tx.order.updateMany({
        where: { id: order.id, status: { in: ['OPEN', 'PARTIAL'] } },
        data: {
          status: 'CANCELLED',
          cancelReason: CANCEL_REASON_RETRY_EXHAUSTED,
          nextAttemptAt: null,
        },
      })
      if (claim.count !== 1) return []

      const legs: ExhaustedLeg[] = [
        {
          id: order.id,
          userId: order.userId,
          side: order.side,
          quantity: order.quantity,
          ticker: order.asset.ticker,
        },
      ]

      if (order.groupId) {
        const siblings = await tx.order.findMany({
          where: {
            groupId: order.groupId,
            id: { not: order.id },
            status: { in: ['OPEN', 'PARTIAL'] },
          },
          select: {
            id: true,
            userId: true,
            side: true,
            quantity: true,
            asset: { select: { ticker: true } },
          },
        })
        if (siblings.length > 0) {
          await tx.order.updateMany({
            where: { id: { in: siblings.map((s) => s.id) } },
            data: {
              status: 'CANCELLED',
              cancelReason: CANCEL_REASON_OCO_SIBLING,
              nextAttemptAt: null,
            },
          })
          legs.push(
            ...siblings.map((s) => ({
              id: s.id,
              userId: s.userId,
              side: s.side as string,
              quantity: s.quantity,
              ticker: s.asset.ticker,
            })),
          )
        }
      }

      return legs
    })
  } catch (err) {
    logger.error(`[${logPrefix}] EXHAUSTED_CANCEL_FAIL orderId=${order.id} ${describeError(err)}`)
    return
  }

  if (cancelled.length === 0) return

  for (const leg of cancelled) {
    const isPrimary = leg.id === order.id
    await persist({
      userId: leg.userId,
      type: 'ORDER_CANCELLED',
      idempotencyKey: `motor:order_cancelled:retry_exhausted:${leg.id}`,
      title: `Ordem cancelada: ${leg.ticker}`,
      body: isPrimary
        ? `Sua ordem de ${leg.side === 'BUY' ? 'compra' : 'venda'} de ${leg.quantity} ${leg.ticker} foi cancelada porque não foi possível executá-la após ${MAX_ATTEMPTS} tentativas. Nenhum valor foi debitado da sua conta. Você pode enviar uma nova ordem.`
        : `Sua ordem de ${leg.side === 'BUY' ? 'compra' : 'venda'} de ${leg.quantity} ${leg.ticker} foi cancelada junto com a ordem par (OCO), que não pôde ser executada. Nenhum valor foi debitado da sua conta.`,
      data: {
        orderId: leg.id,
        ticker: leg.ticker,
        side: leg.side,
        quantity: leg.quantity,
        motivo: isPrimary ? CANCEL_REASON_RETRY_EXHAUSTED : CANCEL_REASON_OCO_SIBLING,
      },
    })
  }

  logger.error(
    `[${logPrefix}] RETRY_EXHAUSTED orderId=${order.id} ticker=${order.asset.ticker} userId=${order.userId} cancelledOrderIds=${cancelled.map((l) => l.id).join(',')}`
  )
}
