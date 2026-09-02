// ============================================================================
// FootStock — reconcile-stuck-orders (Fase 3, M072)
// Varredura de ordens presas em OPEN/PARTIAL e encerramento manual auditavel.
//
// Uso (rodar de footstock-next/):
//   DATABASE_URL=... npm run reconcile:orders                      # dry-run (default)
//   DATABASE_URL=... npm run reconcile:orders -- --json
//   DATABASE_URL=... npm run reconcile:orders -- --apply
//   DATABASE_URL=... npm run reconcile:orders -- --apply --min-age-hours 48
//
// O `npm run` nao e conveniencia: ele carrega `--conditions=react-server`, e sem
// esse flag o script NAO SOBE. `src/lib/prisma` e `NotificationRepository`
// comecam com `import 'server-only'`, cujo pacote so resolve para modulo vazio
// sob a condicao `react-server`; no resolver padrao do node ele lanca de
// proposito. Chamar `npx tsx scripts/reconcile-stuck-orders.ts` direto morre em
// "This module cannot be imported from a Client Component module" antes da
// primeira linha do script — mesma armadilha que o cabecalho de
// `reconcile-public-league-memberships.ts` ainda documenta errado.
//
// A alternativa seria o script instanciar o proprio `PrismaClient` e gravar a
// notificacao com um `notification.create` local, mas isso e exatamente a
// segunda copia do create que o resto da base evita: a chave de idempotencia e o
// formato do aviso passariam a existir em dois lugares e divergiriam.
//
// O que este script E:
//   Uma rede de contencao operada por humano para o caso em que a maquina de
//   ciclo de vida da Fase 3 deixar passar uma ordem. Cada peca nova do retry
//   (contador, backoff, cancelamento por esgotamento) e um modo novo de deixar
//   ordem presa; este script e o invariante que verifica que nenhuma ficou.
//
// O que este script NAO E:
//   - Nao e cron. Nao e chamado por build, migration, deploy ou scheduler.
//   - Nao substitui `order-expiry.ts` (30 dias, desfecho EXPIRED). Aqui o
//     desfecho e CANCELLED com `cancelReason = 'RECONCILIATION'`, e os dois
//     motivos sao deliberadamente distintos no historico.
//   - Nao "conserta" a ordem. Encerra e avisa. Se o motivo da parada for um bug
//     do motor, o bug continua de pe — o log da varredura e que aponta para ele.
//
// Seguranca:
//   - Dry-run por padrao. Nenhuma gravacao sem --apply explicito.
//   - So toca ordem mais velha que --min-age-hours (default 24h) E fora de
//     backoff ativo (`nextAttemptAt` no futuro significa que o motor ainda vai
//     tentar; encerrar ali seria roubar uma tentativa legitima).
//   - CAS no status (`updateMany` com guarda), nunca update por id nu: entre a
//     leitura e a escrita o motor pode liquidar a ordem, e sobrescrever FILLED
//     por CANCELLED e perda financeira silenciosa.
//   - Par OCO encerrado nas duas pernas dentro da MESMA transaction, com as
//     pernas lidas DENTRO dela e com o MESMO filtro de status do update — a
//     mesma correcao que `order-expiry.ts` ja teve de fazer.
//   - Criterio de aceite: rodar duas vezes seguidas com --apply; a segunda tem
//     que ser no-op total (`cancelled=0`).
// ============================================================================

import { prisma } from '../src/lib/prisma'
import { notificationRepository } from '../src/lib/repositories/NotificationRepository'
import { ORDER_STATUS } from '../src/lib/enums'

/**
 * Motivo gravado em `Order.cancelReason`. Faz parte do vocabulario fechado da
 * Fase 3 (ver `docs/FASE3-ciclo-de-vida-da-ordem.md` §6) e e o unico valor que
 * este script escreve. Distinto de EXPIRED (velhice) e de
 * EXECUTION_RETRY_EXHAUSTED (o motor tentou e desistiu sozinho): aqui um humano
 * decidiu encerrar algo que nenhum dos dois caminhos automaticos alcancou.
 */
const CANCEL_REASON = 'RECONCILIATION'

/** Idade minima default. Limiar operacional, nao backstop: o backstop e o expiry de 30 dias. */
const DEFAULT_MIN_AGE_HOURS = 24

/** Nao encerra o par OCO pela perna irma duas vezes. */
const LIVE_STATUSES = [ORDER_STATUS.OPEN, ORDER_STATUS.PARTIAL]

const SIDE_LABEL: Record<string, string> = { BUY: 'de compra', SELL: 'de venda' }

export interface Args {
  apply: boolean
  json: boolean
  minAgeHours: number
}

interface StuckLeg {
  id: string
  userId: string
  side?: string | null
  quantity?: number | null
  price?: unknown
  status?: string | null
}

export interface StuckRow {
  orderId: string
  ticker: string
  type: string
  status: string
  ageHours: number
  attemptCount: number
  lastErrorCode: string | null
  lastAttemptAt: string | null
  nextAttemptAt: string | null
  /** `false` quando `nextAttemptAt` esta no futuro: o motor ainda vai tentar. */
  eligible: boolean
  /** Preenchido so em --apply. */
  outcome?: 'CANCELLED' | 'RACED' | 'FAILED'
  legs?: number
}

export interface ReconcileSummary {
  mode: 'DRY-RUN' | 'APPLY'
  minAgeHours: number
  scanned: number
  eligible: number
  inBackoff: number
  cancelled: number
  raced: number
  failed: number
  rows: StuckRow[]
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, json: false, minAgeHours: DEFAULT_MIN_AGE_HOURS }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--apply') a.apply = true
    else if (t === '--json') a.json = true
    else if (t === '--min-age-hours') a.minAgeHours = Math.max(1, Math.trunc(Number(argv[++i])))
  }
  return a
}

export function sanitizeId(id: string): string {
  return `${id.slice(0, 4)}...${id.slice(-4)}`
}

function hoursBetween(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/**
 * Aviso duravel do encerramento. Chave `reconciliation:order:{id}` — disjunta de
 * `expiry:order:{id}` e de `motor:order_cancelled:retry_exhausted:{id}` de
 * proposito (§8.2 do design): a colisao no UNIQUE de `notifications` e a rede de
 * seguranca contra aviso duplicado, nao a regra.
 *
 * O corpo e honesto sobre o que aconteceu: a ordem nao executou e ninguem
 * consegue dizer com certeza por que. Escrever "cancelada" sem mais nada
 * treinaria o usuario a achar que ele fez algo.
 *
 * Nunca lanca: o status CANCELLED ja foi gravado quando esta funcao roda.
 */
async function notifyReconciled(leg: StuckLeg, ticker: string, ageHours: number): Promise<void> {
  const { userId, id: orderId, side, quantity, price, status } = leg
  const partial = status === ORDER_STATUS.PARTIAL
  const alvo =
    side && quantity != null
      ? `${SIDE_LABEL[side] ?? side.toLowerCase()} de ${quantity} ${ticker}`
      : `de ${ticker}`
  const precoNum = price == null ? null : Number(price)
  const descricao =
    precoNum != null && Number.isFinite(precoNum) ? `${alvo} a ${precoNum.toFixed(2)} FS` : alvo
  const desfecho = partial
    ? 'ficou parada com execução apenas parcial e foi encerrada. A parte já executada continua na sua carteira; a quantidade restante foi cancelada e nada mais será debitado.'
    : 'ficou parada sem executar e foi encerrada. Nenhum valor foi debitado.'

  try {
    await notificationRepository.create({
      userId,
      type: 'ORDER_CANCELLED',
      title: 'Ordem encerrada',
      body: `Sua ordem ${descricao} ${desfecho}`,
      idempotencyKey: `reconciliation:order:${orderId}`,
      metadata: {
        orderId,
        ticker,
        side: side ?? null,
        quantity: quantity ?? null,
        price: precoNum,
        statusAnterior: status ?? null,
        motivo: 'reconciliation',
        ageHours,
        status: ORDER_STATUS.CANCELLED,
      },
    })
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      console.info(`[reconcile-stuck-orders] aviso da ordem ${orderId} já entregue (idempotente)`)
    } else {
      console.error(`[reconcile-stuck-orders] Falha ao notificar ordem ${orderId}:`, err)
    }
  }
}

export async function run(args: Args, now: Date = new Date()): Promise<ReconcileSummary> {
  const threshold = new Date(now.getTime() - args.minAgeHours * 3_600_000)

  const stuck = await prisma.order.findMany({
    where: {
      status: { in: LIVE_STATUSES },
      createdAt: { lt: threshold },
    },
    include: { asset: { select: { ticker: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const counts = { scanned: stuck.length, eligible: 0, inBackoff: 0, cancelled: 0, raced: 0, failed: 0 }
  const rows: StuckRow[] = []
  const processedGroupIds = new Set<string>()

  for (const order of stuck) {
    // Backoff ativo = o motor ainda vai tentar. Encerrar aqui roubaria uma
    // tentativa legitima e transformaria uma ordem sa em ordem cancelada.
    const inBackoff = order.nextAttemptAt !== null && order.nextAttemptAt > now
    const ageHours = hoursBetween(order.createdAt, now)

    const row: StuckRow = {
      orderId: sanitizeId(order.id),
      ticker: order.asset?.ticker ?? '?',
      type: order.type,
      status: order.status,
      ageHours,
      attemptCount: order.attemptCount ?? 0,
      lastErrorCode: order.lastErrorCode ?? null,
      lastAttemptAt: iso(order.lastAttemptAt),
      nextAttemptAt: iso(order.nextAttemptAt),
      eligible: !inBackoff,
    }

    if (inBackoff) counts.inBackoff++
    else counts.eligible++

    if (!args.apply || inBackoff) {
      rows.push(row)
      continue
    }

    // Perna irma de par OCO ja encerrada no passe do grupo: nao conta de novo.
    if (order.groupId && processedGroupIds.has(order.groupId)) continue

    try {
      if (order.type === 'OCO' && order.groupId) {
        const legs = await prisma.$transaction(async (tx) => {
          const alive = await tx.order.findMany({
            where: { groupId: order.groupId!, status: { in: LIVE_STATUSES } },
            select: { id: true, userId: true, side: true, quantity: true, price: true, status: true },
          })
          await tx.order.updateMany({
            where: { groupId: order.groupId!, status: { in: LIVE_STATUSES } },
            data: { status: ORDER_STATUS.CANCELLED, cancelReason: CANCEL_REASON, nextAttemptAt: null },
          })
          return alive
        })

        if (legs.length === 0) {
          row.outcome = 'RACED'
          counts.raced++
        } else {
          for (const leg of legs) await notifyReconciled(leg, row.ticker, ageHours)
          row.outcome = 'CANCELLED'
          row.legs = legs.length
          counts.cancelled += legs.length
        }
        processedGroupIds.add(order.groupId)
      } else {
        const claimed = await prisma.order.updateMany({
          where: { id: order.id, status: { in: LIVE_STATUSES } },
          data: { status: ORDER_STATUS.CANCELLED, cancelReason: CANCEL_REASON, nextAttemptAt: null },
        })
        if (claimed.count === 0) {
          // O motor liquidou (ou outro processo encerrou) entre a leitura e a
          // escrita. Nao e falha: e a guarda funcionando.
          row.outcome = 'RACED'
          counts.raced++
        } else {
          await notifyReconciled(order, row.ticker, ageHours)
          row.outcome = 'CANCELLED'
          row.legs = 1
          counts.cancelled++
        }
      }
    } catch (err) {
      row.outcome = 'FAILED'
      counts.failed++
      console.error(`[reconcile-stuck-orders] Falha ao encerrar ordem ${order.id}:`, err)
    }

    rows.push(row)
  }

  return { mode: args.apply ? 'APPLY' : 'DRY-RUN', minAgeHours: args.minAgeHours, ...counts, rows }
}

function printSummary(summary: ReconcileSummary, args: Args): void {
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  console.log(`\n=== reconcile-stuck-orders [${summary.mode}] (idade minima: ${summary.minAgeHours}h) ===`)
  console.log(`scanned=${summary.scanned}  eligible=${summary.eligible}  inBackoff=${summary.inBackoff}`)
  if (summary.mode === 'APPLY') {
    console.log(`cancelled=${summary.cancelled}  raced=${summary.raced}  failed=${summary.failed}`)
  }

  if (summary.rows.length === 0) {
    console.log('\nNenhuma ordem presa. (Este e o estado esperado.)')
  } else {
    console.log('\n--- ordens ---')
    for (const r of summary.rows) console.log(' ', r)
  }

  if (summary.mode === 'DRY-RUN') {
    console.log('\n(dry-run — nada gravado. Use --apply para encerrar as elegiveis.)')
  } else {
    console.log('\n(rodar de novo deve dar cancelled=0. Se nao der, ha ordem nova entrando na janela.)')
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('ERRO: defina DATABASE_URL no ambiente.')
    process.exit(1)
  }

  const args = parseArgs(process.argv.slice(2))
  const summary = await run(args)
  printSummary(summary, args)
  await prisma.$disconnect()

  // Falha parcial precisa virar exit code: rodado em janela de manutencao, o
  // operador le o exit, nao a ultima linha do stdout.
  if (summary.failed > 0) process.exit(1)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
