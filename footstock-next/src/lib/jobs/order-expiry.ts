// ============================================================================
// FootStock — Job: expiração de ordens MARKET/LIMIT/OCO/SCHEDULED após 30 dias
// Executado diariamente às 00:05 BRT pelo scheduler (lib/jobs/scheduler.ts).
// Rastreabilidade: INT-012, INT-013 / TASK-3/ST004
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { notificationRepository } from '@/lib/repositories/NotificationRepository'
import { ORDER_STATUS } from '@/lib/enums'
import { validateTransition } from '@/lib/contracts/order-contract'

const EXPIRY_DAYS = 30

/**
 * Grava o aviso DURÁVEL de expiração e, só depois, publica no canal Redis.
 *
 * Zero Silêncio (2026-09-02). Este job só publicava em `notifications:{userId}`, um
 * canal que NÃO tem assinante em lugar nenhum do repositório — o frontend lê a tabela
 * `notifications` por polling. Ou seja: a ordem saía da lista de abertas e o usuário
 * não recebia nada. O defeito ficou latente enquanto o job ignorava MARKET; ao incluí-la
 * (rede de segurança para ordem a mercado que o motor não consegue liquidar), o caminho
 * silencioso passou a valer justamente para o tipo de ordem do incidente de 31/08.
 *
 * Escreve direto no repositório, e não via `notificationService.sendNotification`, de
 * propósito: este cron roda 06:00 UTC (03:00 BRT), dentro do quiet hours, e o
 * `sendNotification` enfileiraria o aviso numa fila Redis que é drenada por OUTRO cron e
 * que descarta em silêncio quando o Redis está fora — trocaria um silêncio por outro.
 * Linha in-app não acorda ninguém (ORDER_CANCELLED não está em PUSH_ENABLED_TYPES), então
 * o quiet hours não protege nada aqui. Mesma decisão e mesmo canal do motor
 * (`OrderExecutor._persistOrderNotification`).
 *
 * Nunca lança: o status EXPIRED já foi gravado quando esta função roda, e falhar aqui não
 * pode reverter nem abortar o restante do lote.
 *
 * O corpo identifica lado, quantidade e preço de propósito: o usuário pode ter mais de uma
 * ordem aberta no mesmo ticker, e "sua ordem de URU3 expirou" sozinho não diz qual delas foi.
 * O preço não é decoração — nas DUAS pernas de um par OCO ele é o ÚNICO campo diferente
 * (`OrderService.createOrder` compartilha side e quantity entre stop-loss e take-profit), então
 * sem ele o usuário recebe dois avisos byte-idênticos por uma única ordem que ele colocou.
 *
 * O corpo também ramifica por status. `PARTIAL` entra nesta varredura (ordem parcialmente
 * executada que estagnou), e para ela "sem execução / nenhum valor foi debitado" é
 * simplesmente FALSO: parte executou e parte foi cobrada. Dizer isso numa linha durável que
 * o usuário lê é pior que o silêncio que esta correção veio matar.
 */
async function notifyExpired(leg: ExpiredLeg, ticker: string): Promise<void> {
  const { userId, id: orderId, side, quantity, price, status } = leg
  const partial = status === ORDER_STATUS.PARTIAL
  const alvo = side && quantity != null ? `${SIDE_LABEL[side] ?? side.toLowerCase()} de ${quantity} ${ticker}` : `de ${ticker}`
  const precoNum = price == null ? null : Number(price)
  const descricao = precoNum != null && Number.isFinite(precoNum) ? `${alvo} a ${precoNum.toFixed(2)} FS` : alvo
  const desfecho = partial
    ? `expirou após ${EXPIRY_DAYS} dias com execução apenas parcial. A parte já executada continua na sua carteira; a quantidade restante foi cancelada e nada mais será debitado.`
    : `expirou após ${EXPIRY_DAYS} dias sem execução. Nenhum valor foi debitado.`
  try {
    await notificationRepository.create({
      userId,
      type: 'ORDER_CANCELLED',
      title: 'Ordem expirada',
      body: `Sua ordem ${descricao} ${desfecho}`,
      // Uma ordem expira UMA vez. A chave amarra o aviso ao evento, não à execução do
      // cron: duas instâncias do app rodando o mesmo agendamento, ou um retry após
      // crash, colidem no UNIQUE de `notifications.idempotency_key` em vez de duplicar.
      idempotencyKey: `expiry:order:${orderId}`,
      metadata: {
        orderId,
        ticker,
        side: side ?? null,
        quantity: quantity ?? null,
        price: precoNum,
        statusAnterior: status ?? null,
        motivo: 'expiry',
        status: ORDER_STATUS.EXPIRED,
      },
    })
  } catch (err) {
    // P2002 = a chave idempotente ja existe, ou seja, este aviso JA foi entregue.
    // Nao e falha: e a deduplicacao funcionando. Logar como erro treinaria o
    // operador a ignorar a linha que importa.
    if ((err as { code?: string })?.code === 'P2002') {
      console.info(`[order-expiry] aviso de expiração da ordem ${orderId} já entregue (idempotente)`)
    } else {
      console.error(`[order-expiry] Falha ao notificar expiração da ordem ${orderId}:`, err)
    }
  }

  await redis
    .publish(
      `notifications:${userId}`,
      JSON.stringify({
        type: 'ORDER_CANCELLED',
        orderId,
        ticker,
        motivo: 'Ordem expirada após 30 dias',
        status: ORDER_STATUS.EXPIRED,
      })
    )
    .catch(() => {})
}

/** Campos mínimos que identificam a ordem expirada no aviso ao usuário. */
interface ExpiredLeg {
  id: string
  userId: string
  side?: string | null
  quantity?: number | null
  price?: unknown
  status?: string | null
}

const SIDE_LABEL: Record<string, string> = { BUY: 'de compra', SELL: 'de venda' }

export interface ExpiryResult {
  expired: number
  processedAt: Date
  tickers: string[]
}

export async function processExpiredOrders(): Promise<ExpiryResult> {
  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() - EXPIRY_DAYS)

  const expiredOrders = await prisma.order.findMany({
    where: {
      // #2: incluir PARTIAL — ordens parcialmente executadas que estagnam também precisam expirar
      // aos 30 dias (PARTIAL->EXPIRED é transição válida). Sem isto, elas nunca expiram e seguem
      // comprometendo saldo/quantidade nos guards de capacidade, sem alívio automático.
      status: { in: [ORDER_STATUS.OPEN, ORDER_STATUS.PARTIAL] },
      // MARKET incluída (bug 2026-09-02): este job é o ÚNICO varredor de ordens
      // estagnadas do produto. Enquanto MARKET ficou de fora, uma ordem a mercado
      // que o motor não conseguisse liquidar (ativo removido do tick, unique index
      // barrando a posição) ficava OPEN para sempre — sem estado terminal, sem
      // alívio dos guards de capacidade e visível para o cliente como "Aberta"
      // indefinidamente. Em regime normal nenhuma MARKET sobrevive 30 dias, então
      // a inclusão é inerte; ela existe como rede de segurança, não como remédio:
      // 30 dias é tempo de encerrar, não de corrigir.
      type: { in: ['MARKET', 'LIMIT', 'OCO', 'SCHEDULED'] },
      createdAt: { lt: expiryDate },
    },
    include: { asset: true },
  })

  if (expiredOrders.length === 0) {
    return { expired: 0, processedAt: new Date(), tickers: [] }
  }

  let expiredCount = 0
  const tickers: string[] = []
  const processedGroupIds = new Set<string>()

  for (const order of expiredOrders) {
    try {
      if (order.groupId && processedGroupIds.has(order.groupId)) continue

      validateTransition(order.status as import('@/lib/enums').OrderStatus, ORDER_STATUS.EXPIRED, order.id)

      if (order.type === 'OCO' && order.groupId) {
        // Expirar as pernas AINDA VIVAS do par OCO na mesma transaction.
        //
        // As pernas notificadas sao capturadas DENTRO da transaction e ANTES do
        // updateMany, filtradas pelo mesmo `status IN (OPEN, PARTIAL)` que o update
        // usa. Ler depois, sem filtro, devolvia o grupo inteiro (2026-09-02): um par
        // OCO com uma perna ja FILLED ou CANCELLED gerava aviso "Ordem expirada" para
        // a perna que nunca expirou. Enquanto a notificacao era so um publish num canal
        // sem assinante isso era invisivel; agora e uma linha real em `notifications`
        // que o usuario le — mentir sobre o estado da ordem e pior que o silencio que
        // esta correcao veio matar. `expiredCount` conta a mesma lista, pelo mesmo motivo.
        //
        // O par OCO nao fica orfao: cancelar a perna irma e responsabilidade do
        // OrderMatcher no fill; aqui as duas pernas expiram juntas quando as duas
        // ainda estao vivas, que e o unico caso em que o updateMany toca as duas.
        const legs = await prisma.$transaction(async (tx) => {
          const alive = await tx.order.findMany({
            where: { groupId: order.groupId!, status: { in: [ORDER_STATUS.OPEN, ORDER_STATUS.PARTIAL] } },
            select: { id: true, userId: true, side: true, quantity: true, price: true, status: true },
          })
          await tx.order.updateMany({
            where: { groupId: order.groupId!, status: { in: [ORDER_STATUS.OPEN, ORDER_STATUS.PARTIAL] } },
            data: { status: 'EXPIRED' },
          })
          return alive
        })

        for (const leg of legs) {
          await notifyExpired(leg, order.asset.ticker)
        }
        expiredCount += legs.length
        processedGroupIds.add(order.groupId)
      } else {
        // CAS no status, e nao update por id nu.
        //
        // Entre o findMany la em cima e esta escrita existe uma janela real: o motor
        // pode liquidar a ordem nesse intervalo. Um `update({ where: { id } })` sem
        // guarda sobrescreveria FILLED por EXPIRED — perda financeira silenciosa — e,
        // agora que o aviso e uma linha duravel, ainda mandaria "expirou sem execucao,
        // nenhum valor foi debitado" para uma ordem que acabou de executar e debitar.
        // A mesma guarda fecha a corrida entre duas instancias do app rodando o
        // agendamento: so a que ganhar o update notifica.
        const claimed = await prisma.order.updateMany({
          where: { id: order.id, status: { in: [ORDER_STATUS.OPEN, ORDER_STATUS.PARTIAL] } },
          data: { status: 'EXPIRED' },
        })
        if (claimed.count === 0) {
          console.info(`[order-expiry] ordem ${order.id} mudou de estado antes da expiracao; ignorada`)
          continue
        }
        await notifyExpired(order, order.asset.ticker)
        expiredCount++
      }

      if (!tickers.includes(order.asset.ticker)) tickers.push(order.asset.ticker)
    } catch (err) {
      console.error(`[order-expiry] Falha ao expirar ordem ${order.id}:`, err)
    }
  }

  await redis.incr('motor:metrics:orders_expired').catch(() => {})

  const result: ExpiryResult = { expired: expiredCount, processedAt: new Date(), tickers }
  console.info(`[order-expiry] ${JSON.stringify(result)}`)
  return result
}

export default processExpiredOrders
