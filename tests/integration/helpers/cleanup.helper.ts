// ============================================================================
// FootStock — Integration Tests: cleanup em cascata de usuarios de teste
// ============================================================================
//
// `user.deleteMany({ where: { email: { endsWith: ... } } })` sozinho NAO basta:
// das 33 FKs que apontam para `users` no schema canonico, 15 sao NO ACTION
// (orders, positions, transactions, payments, subscriptions, notifications,
// dividends, forum_posts...). Enquanto a factory de ordens estava quebrada
// nenhuma linha filha nascia e o delete nu passava; consertada a factory, todo
// `afterEach` passou a morrer em `orders_user_id_fkey`.
//
// A lista de dependentes NAO e escrita a mao aqui, de proposito: e derivada do
// catalogo do Postgres a cada execucao. Lista fixa viraria drift silencioso no
// dia em que um model novo referenciasse `users` -- exatamente o modo de falha
// que este harness ja teve duas vezes (coluna removida, model novo no schema do
// app e ausente no do motor).

import type { PrismaClient } from '@prisma/client'

type ChaveEstrangeira = {
  tabelaFilha: string
  colunaFilha: string
  tabelaPai: string
  colunaPai: string
  colunas: number
}

const cacheFks = new WeakMap<object, ChaveEstrangeira[]>()
const cachePks = new WeakMap<object, Map<string, string | null>>()

async function carregarChavesEstrangeiras(prisma: PrismaClient): Promise<ChaveEstrangeira[]> {
  const cache = cacheFks.get(prisma)
  if (cache) return cache

  const fks = await prisma.$queryRawUnsafe<ChaveEstrangeira[]>(`
    SELECT
      con.conrelid::regclass::text        AS "tabelaFilha",
      att_filha.attname::text             AS "colunaFilha",
      con.confrelid::regclass::text       AS "tabelaPai",
      att_pai.attname::text               AS "colunaPai",
      array_length(con.conkey, 1)::int    AS "colunas"
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey, con.confkey) AS k(filha, pai) ON true
    JOIN pg_attribute att_filha ON att_filha.attrelid = con.conrelid  AND att_filha.attnum = k.filha
    JOIN pg_attribute att_pai   ON att_pai.attrelid   = con.confrelid AND att_pai.attnum   = k.pai
    WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
  `)

  cacheFks.set(prisma, fks)
  return fks
}

/** Chave primaria de coluna unica; null quando composta ou ausente. */
async function chavePrimariaDe(prisma: PrismaClient, tabela: string): Promise<string | null> {
  let mapa = cachePks.get(prisma)
  if (!mapa) {
    mapa = new Map()
    cachePks.set(prisma, mapa)
  }
  const memo = mapa.get(tabela)
  if (memo !== undefined) return memo

  const linhas = await prisma.$queryRawUnsafe<{ coluna: string }[]>(
    `
    SELECT att.attname::text AS coluna
    FROM pg_index idx
    JOIN pg_attribute att ON att.attrelid = idx.indrelid AND att.attnum = ANY(idx.indkey)
    WHERE idx.indrelid = $1::regclass AND idx.indisprimary
  `,
    tabela
  )

  const pk = linhas.length === 1 ? linhas[0].coluna : null
  mapa.set(tabela, pk)
  return pk
}

/**
 * Apaga `tabela WHERE coluna IN valores` depois de apagar recursivamente tudo
 * que aponta para essas linhas.
 *
 * `caminho` e o guard de ciclo: ao reentrar numa tabela ja visitada a recursao
 * para. Isso e o que impede, por exemplo, `users -> leagues -> league_members ->
 * users` de sair apagando usuario que o teste nao criou.
 */
async function apagarEmCascata(
  prisma: PrismaClient,
  tabela: string,
  coluna: string,
  valores: string[],
  caminho: string[] = []
): Promise<void> {
  if (valores.length === 0 || caminho.includes(tabela)) return

  const proximoCaminho = [...caminho, tabela]
  const fks = await carregarChavesEstrangeiras(prisma)

  for (const fk of fks) {
    if (fk.tabelaPai !== tabela || fk.colunaPai !== coluna) continue
    // FK composta: apagar por uma coluna so removeria linha que nao referencia o alvo.
    if (fk.colunas > 1) continue
    // Auto-referencia: as linhas filhas ja caem no mesmo DELETE final.
    if (fk.tabelaFilha === tabela) continue

    const pkFilha = await chavePrimariaDe(prisma, fk.tabelaFilha)

    if (pkFilha) {
      const filhas = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "${pkFilha}"::text AS id FROM "${fk.tabelaFilha}" WHERE "${fk.colunaFilha}"::text = ANY($1::text[])`,
        valores
      )
      await apagarEmCascata(
        prisma,
        fk.tabelaFilha,
        pkFilha,
        filhas.map((linha) => linha.id),
        proximoCaminho
      )
    } else {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "${fk.tabelaFilha}" WHERE "${fk.colunaFilha}"::text = ANY($1::text[])`,
        valores
      )
    }
  }

  await prisma.$executeRawUnsafe(
    `DELETE FROM "${tabela}" WHERE "${coluna}"::text = ANY($1::text[])`,
    valores
  )
}

/** Remove os usuarios do dominio de teste e TODA a arvore de dados deles. */
export async function limparUsuariosDeTeste(
  prisma: PrismaClient,
  dominioEmail: string
): Promise<number> {
  const usuarios = await prisma.user.findMany({
    where: { email: { endsWith: dominioEmail } },
    select: { id: true },
  })

  if (usuarios.length === 0) return 0

  await apagarEmCascata(prisma, 'users', 'id', usuarios.map((usuario) => usuario.id))
  return usuarios.length
}
