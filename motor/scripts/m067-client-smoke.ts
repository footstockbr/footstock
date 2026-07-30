// Smoke do client Prisma do MOTOR contra as colunas da M067 (item 009 do loop
// 07-28-noticias-multi-time-linha-por-time).
//
// POR QUE ESTE SCRIPT EXISTE
// O client do motor NAO e gerado do schema do app. O Dockerfile do motor (e o
// Dockerfile da raiz) copia `prisma/schema.prisma` DA RAIZ para o build context e roda
// `prisma generate` de la. Se `groupId`/`groupRank`/`impactDispatchedAt` entrarem apenas
// em `footstock-next/prisma/schema.prisma`, o motor sobe com um client que nao conhece os
// campos e toda escrita do publisher morre em `PrismaClientValidationError` - que hoje e
// engolida pelo `return` silencioso do `NewsPublisher` (RB0/F4/F7 do documento de pesquisa).
// Este smoke prova, pelo client do motor, que os tres campos existem e trafegam.
//
// USO
//   DATABASE_URL=postgresql://... npx ts-node scripts/m067-client-smoke.ts
//
// Requer um banco com a M067 aplicada. NAO faz parte do build (scripts/ fora de rootDir).
// Idempotente: limpa as linhas que cria (prefixo m067-smoke-) na entrada e na saida.

import { PrismaClient, Prisma } from '@prisma/client'

const PREFIX = 'm067-smoke-'
const GROUP_ID = `${PREFIX}group-1`

const prisma = new PrismaClient()

let failures = 0

function ok(label: string, detail: string): void {
  console.log(`  [OK]   ${label} - ${detail}`)
}

function fail(label: string, detail: string): void {
  failures += 1
  console.log(`  [FAIL] ${label} - ${detail}`)
}

async function cleanup(): Promise<void> {
  await prisma.news.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function main(): Promise<void> {
  console.log('=== [M067/009] SMOKE DO CLIENT DO MOTOR ===')
  console.log(`Prisma Client: ${Prisma.prismaVersion.client}`)
  await cleanup()

  // ─── 1. Escrita dos tres campos novos pelo client do motor ────────────────
  const dispatchedAt = new Date('2026-07-29T03:00:00.000Z')
  const anchor = await prisma.news.create({
    data: {
      id: `${PREFIX}rank-0`,
      title: 'Smoke M067 - ancora do grupo',
      content: 'corpo',
      impact: 'ESPORTIVA_MAJORITARIA',
      sentiment: 'BULLISH',
      assetIds: ['asset-uru'],
      ticker: 'URU3',
      isPublished: true,
      publishedAt: dispatchedAt,
      updatedAt: dispatchedAt,
      groupId: GROUP_ID,
      groupRank: 0,
      impactDispatchedAt: dispatchedAt,
      sentimentClassifiedAt: dispatchedAt,
    },
  })
  ok('create com groupId/groupRank/impactDispatchedAt', `id=${anchor.id}`)

  // ─── 2. Leitura por select explicito dos tres campos ──────────────────────
  const read = await prisma.news.findUniqueOrThrow({
    where: { id: `${PREFIX}rank-0` },
    select: {
      id: true,
      groupId: true,
      groupRank: true,
      impactDispatchedAt: true,
      sentimentClassifiedAt: true,
    },
  })
  if (read.groupId === GROUP_ID && read.groupRank === 0 && read.impactDispatchedAt?.toISOString() === dispatchedAt.toISOString()) {
    ok('select dos tres campos', JSON.stringify(read))
  } else {
    fail('select dos tres campos', `valores inesperados: ${JSON.stringify(read)}`)
  }
  if (read.sentimentClassifiedAt?.toISOString() === dispatchedAt.toISOString()) {
    ok('sentimentClassifiedAt visivel pelo client do motor', read.sentimentClassifiedAt.toISOString())
  } else {
    fail('sentimentClassifiedAt visivel pelo client do motor', JSON.stringify(read.sentimentClassifiedAt))
  }

  // ─── 3. Fan-out de grupo (rank 1 e 2) na forma que o item 013 vai usar ────
  await prisma.$transaction([
    prisma.news.create({
      data: {
        id: `${PREFIX}rank-1`,
        title: 'Smoke M067 - irmao rank 1',
        content: 'corpo',
        impact: 'ESPORTIVA_MAJORITARIA',
        sentiment: 'BEARISH',
        assetIds: ['asset-por'],
        ticker: 'POR3',
        isPublished: true,
        publishedAt: dispatchedAt,
        updatedAt: dispatchedAt,
        groupId: GROUP_ID,
        groupRank: 1,
      },
    }),
    prisma.news.create({
      data: {
        id: `${PREFIX}rank-2`,
        title: 'Smoke M067 - irmao rank 2',
        content: 'corpo',
        impact: 'ESPORTIVA_MAJORITARIA',
        sentiment: 'NEUTRAL',
        assetIds: ['asset-reg'],
        ticker: 'REG3',
        isPublished: true,
        publishedAt: dispatchedAt,
        updatedAt: dispatchedAt,
        groupId: GROUP_ID,
        groupRank: 2,
      },
    }),
  ])
  const siblings = await prisma.news.findMany({
    where: { groupId: GROUP_ID },
    orderBy: { groupRank: 'asc' },
    select: { id: true, groupRank: true, ticker: true },
  })
  if (siblings.length === 3 && siblings.map((s) => s.groupRank).join(',') === '0,1,2') {
    ok('fan-out de 3 linhas no mesmo grupo', JSON.stringify(siblings))
  } else {
    fail('fan-out de 3 linhas no mesmo grupo', JSON.stringify(siblings))
  }

  // ─── 4. Where/orderBy pelos campos novos (rota do feed, item 015) ─────────
  const anchors = await prisma.news.findMany({
    where: { isPublished: true, groupRank: 0 },
    orderBy: [{ publishedAt: 'desc' }, { groupId: 'asc' }],
    select: { id: true, groupId: true },
  })
  ok('where groupRank:0 + orderBy [publishedAt desc, groupId asc]', `${anchors.length} ancora(s)`)

  // ─── 5. update de impactDispatchedAt (marcador DB-12, item 014) ──────────
  const marked = await prisma.news.updateMany({
    where: { groupId: GROUP_ID, impactDispatchedAt: null, ticker: { not: null } },
    data: { impactDispatchedAt: new Date('2026-07-29T03:05:00.000Z') },
  })
  ok('updateMany impactDispatchedAt (predicado do reconciliador)', `${marked.count} linha(s) marcada(s)`)

  // ─── 6. Controle negativo: o client REJEITA campo inexistente ────────────
  // Sem este teste, os OKs acima nao provariam nada: um client que ignorasse campo
  // desconhecido aceitaria tudo em silencio. Aqui o erro esperado e o sucesso.
  try {
    await prisma.news.findMany({
      // @ts-expect-error campo proposital que nao existe no model News
      where: { groupIdInexistente: 'x' },
    })
    fail('controle negativo', 'campo inexistente NAO foi rejeitado - client sem validacao')
  } catch (error) {
    if (error instanceof Prisma.PrismaClientValidationError) {
      const firstLine = String(error.message).split('\n').find((l) => l.includes('Unknown argument')) ?? 'PrismaClientValidationError'
      ok('controle negativo', `campo inexistente rejeitado: ${firstLine.trim()}`)
    } else {
      fail('controle negativo', `erro inesperado: ${String(error)}`)
    }
  }

  await cleanup()

  console.log('')
  if (failures === 0) {
    console.log('=== RESULTADO: PASS (0 PrismaClientValidationError nos campos da M067) ===')
  } else {
    console.log(`=== RESULTADO: FAIL (${failures} checagem(ns)) ===`)
    process.exitCode = 1
  }
}

main()
  .catch(async (error) => {
    console.error('=== RESULTADO: FAIL (excecao) ===')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
