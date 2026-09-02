// ============================================================================
// FootStock Motor — Notificacao duravel do ciclo de vida da ordem
//
// FONTE UNICA da entrega in-app dos eventos ORDER_EXECUTED / ORDER_CANCELLED.
//
// Por que este modulo existe (2026-09-02): a linha na tabela `notifications` e o
// canal REAL — o front faz polling da tabela (footstock-next useNotifications, 30s).
// Os canais Redis `orders:*` e `notifications:*` que o motor publica NAO tem
// assinante em nenhum ponto do repositorio. Enquanto so o OrderExecutor (MARKET)
// gravava a linha, LIMIT, OCO e SCHEDULED executavam e cancelavam em silencio
// absoluto: a consulta de producao em 02/09 nao achou UMA UNICA linha de
// ORDER_EXECUTED ou ORDER_CANCELLED desde a primeira notificacao da tabela, em
// 20/04 — os dois tipos existem no enum e nunca foram escritos.
//
// Quem cancela ou executa ordem CHAMA daqui. Nao reimplementar o create: foi a
// duplicacao de lista de tipos always-on que produziu o bug irmao deste, no
// footstock-next (ver NotificationRepository.ALWAYS_ON_TYPES).
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import { logger } from '../utils/logger'
import type { OrderSide } from '../types/prisma.types'

// Limite de texto livre por campo no log de erro. O Railway trata cada quebra de
// linha como um evento separado e trunca payload longo, entao a linha de log
// precisa ser curta e sem \n para sobreviver inteira ate a forense.
const ERROR_TEXT_MAX_CHARS = 300
// Quando trunca, guarda MAIS cauda do que cabeca de proposito: a mensagem do
// Prisma comeca com o cabecalho da invocacao e o code frame (300+ chars medidos)
// e so DEPOIS diz a causa ("Unique constraint failed on the fields: ..."). Cortar
// so o inicio jogava fora exatamente a parte que importa.
const ERROR_HEAD_CHARS = 90

/** Colapsa quebras de linha e espacos repetidos, preservando cabeca E cauda. */
export function toOneLine(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat.length <= ERROR_TEXT_MAX_CHARS) return flat
  const tailChars = ERROR_TEXT_MAX_CHARS - ERROR_HEAD_CHARS
  return `${flat.slice(0, ERROR_HEAD_CHARS)} [...] ${flat.slice(-tailChars)}`
}

/** JSON defensivo: nunca lanca, para nao substituir o erro original por outro. */
export function toShortJson(value: unknown): string {
  if (value === undefined) return 'none'
  try {
    return toOneLine(JSON.stringify(value))
  } catch {
    return 'unserializable'
  }
}

/**
 * Descreve um erro em UMA linha, preservando o que a forense precisa: a classe,
 * o codigo Prisma (P2002 etc) e o meta (qual constraint foi violada). String(err)
 * num erro Prisma devolve o dump multi-linha da invocacao e perde code e meta —
 * foi por isso que os FAILs do incidente de 31/08 chegaram opacos ao Railway.
 * Nao inclui valor financeiro: apenas identificadores tecnicos do proprio erro.
 */
export function describeError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return `errKind=PrismaKnown errCode=${err.code} errMeta=${toShortJson(err.meta)} errMsg=${JSON.stringify(toOneLine(err.message))}`
  }
  if (err instanceof Error) {
    return `errKind=${err.name} errCode=none errMeta=none errMsg=${JSON.stringify(toOneLine(err.message))}`
  }
  return `errKind=unknown errCode=none errMeta=none errMsg=${JSON.stringify(toOneLine(String(err)))}`
}

/** Rotulo em pt-BR do lado da ordem, usado no corpo das notificacoes in-app. */
export function sideLabel(side: OrderSide): string {
  return side === 'BUY' ? 'compra' : 'venda'
}

/**
 * Descreve O QUE o saldo precisava cobrir, respeitando a alavancagem.
 *
 * `settleOrderFill` debita `operationValue / leverageDiv + feeAmount`: numa ordem 2x
 * apenas METADE do valor da operacao sai da conta (a margem). Os quatro avisos de saldo
 * insuficiente do motor diziam "o custo total (valor da operacao mais a taxa)" — texto
 * correto so para 1x. Numa ordem alavancada isso manda o usuario conferir um numero que
 * o sistema nunca tentou debitar, e ele conclui, com razao, que a conta nao fecha.
 *
 * Uma funcao so, e nao quatro strings: era exatamente a duplicacao de texto que produziu
 * o defeito irmao deste no footstock-next (NotificationRepository.ALWAYS_ON_TYPES).
 */
export function costLabel(leverageMultiplier: number | null | undefined): string {
  return leverageMultiplier === 2
    ? 'a margem exigida pela alavancagem 2x (metade do valor da operacao) mais a taxa'
    : 'o custo total (valor da operacao mais a taxa)'
}

export interface OrderNotificationInput {
  userId: string
  type: 'ORDER_EXECUTED' | 'ORDER_CANCELLED'
  /**
   * Chave idempotente. Convencao: `motor:{evento}:{motivo?}:{orderId}`.
   * Precisa ser deterministica sobre o par (evento, ordem) — e ela que faz o
   * reprocessamento ser no-op em vez de duplicar aviso.
   */
  idempotencyKey: string
  title: string
  body: string
  data: Record<string, unknown>
}

/**
 * Grava a notificacao duravel do evento de ordem.
 *
 * Transacao: SEMPRE chamada FORA da transacao Serializable da liquidacao, com o
 * dinheiro ja commitado. Dentro dela, um conflito de serializacao ou um P2002
 * abortaria e reverteria liquidacao correta.
 *
 * Nunca lanca: falha ao notificar nao pode derrubar nem reverter a liquidacao,
 * nem marcar a ordem como falha do batch.
 *
 * Idempotencia: idempotencyKey tem indice UNIQUE (notifications_idempotency_key_key).
 * Em reentrada — redeploy no meio do tick, dois motores durante flap de lideranca,
 * ou futura mudanca que afrouxe o CAS — o insert colide, o P2002 vira no-op e
 * nenhuma linha duplicada e criada. Tratamos P2002 em vez de usar createMany com
 * skipDuplicates para distinguir "ja entregue" de erro real no log.
 *
 * @param logPrefix nome do componente chamador, para a forense saber quem falhou.
 */
export async function persistOrderNotification(
  prisma: PrismaClient,
  logPrefix: string,
  input: OrderNotificationInput,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Chave idempotente ja gravada: notificacao entregue em execucao anterior.
      logger.info(`[${logPrefix}] notificacao ja entregue (idempotente): ${input.idempotencyKey}`)
      return
    }
    logger.error(`[${logPrefix}] Falha ao persistir notificacao ${input.idempotencyKey}: ${describeError(err)}`)
  }
}
