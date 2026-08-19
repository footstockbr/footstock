# Evidencia de conferencia — T-05 (feed publico nao serve noticia arquivada)

Item de loop: `006` / `T-05` — `blacksmith/loop-archives/08-18-foot-stock-motor-noticias-analise/tasks/items/task-006-t-05-impedir-feed-publico-sirva-noticia.md`
Commit da correcao auditada: `8f3a08b` (`footstock-next`)
Data da conferencia: **2026-08-19T03:05:00Z .. 03:05:07Z** (UTC)

---

## 1. Ambiente usado (desvio declarado)

O criterio original pedia "conferencia manual de uma noticia arquivada real **em
staging**". **Nao existe ambiente de staging provisionado para este projeto.**
Verificado antes de decidir:

- `footstock-next/` tem apenas `.env`, `.env.example`, `.env.local`,
  `.env.production.example`. Nenhum `.env.staging`.
- A unica ocorrencia de `staging` no repo e um **template com placeholders
  literais** (`[STAGING] https://staging.foot-stock.com`,
  `postgresql://postgres:[password]@aws-0-[region]...`) dentro de
  `.stryker-tmp/sandbox-*/`. Nao e endpoint real, e nao resolve.
- Nenhuma URL de staging aparece em `.env`/`.env.local` (so `localhost`,
  o endpoint da Kimi e o projeto Supabase).

Substituto usado, **mais forte que clique manual e reproduzivel**:

| Dimensao | Valor |
|---|---|
| Banco | PostgreSQL **18.4** real, dedicado e descartavel |
| DSN | `postgresql://postgres:***@127.0.0.1:5432/footstock_t05_verify?schema=public` |
| Schema | aplicado do `prisma/schema.prisma` do proprio pacote (`prisma db push`) |
| Prisma | client real — **nenhum mock de `@/lib/prisma`** |
| Handler do feed | `GET` real de `src/app/api/v1/news/route.ts` |
| Handler de arquivamento | `PATCH` real de `src/app/api/v1/admin/news/[id]/route.ts` |
| Autorizacao | `hasAdminRole` **real**; so `getAuthUser` foi substituido (autenticacao nao e o objeto da conferencia) |
| Executor | `tests/integration/news-feed-archived-real-db.test.ts` (opt-in via `T05_REAL_DB=1`) |

Por que isto cobre o que a conferencia manual cobriria: o defeito da T-05 e
"linha publicada + arquivada continua saindo no feed". A conferencia exercita
exatamente esse caminho — **arquiva pela mesma rota admin que o operador usa** e
**le pelo mesmo handler que serve o publico** — contra dados reais em Postgres,
sem stub entre o handler e o banco. O que ela NAO cobre e a camada de deploy
(build/cache/CDN do ambiente remoto); isso continua pendente para o dia em que
existir staging, e esta listado na secao 5.

Reproducao:

```bash
cd output/workspace/foot-stock/footstock-next
T05_REAL_DB=1 T05_EVIDENCE=1 \
DATABASE_URL="postgresql://postgres:<senha>@127.0.0.1:5432/footstock_t05_verify?schema=public" \
npx jest tests/integration/news-feed-archived-real-db.test.ts --no-cov --verbose
```

## 2. Fixture (as quatro combinacoes de isPublished x isArchived)

| id | isPublished | isArchived | grupo | papel |
|---|---|---|---|---|
| `t05verify-g1-anchor`  | true  | false | `t05verify-g1` rank 0 | alvo (ancora do grupo) |
| `t05verify-g1-sibling` | true  | false | `t05verify-g1` rank 1 | alvo (irmao — prova a hidratacao) |
| `t05verify-control`    | true  | false | `t05verify-control`   | controle: nunca pode sumir |
| `t05verify-unpub-live` | false | false | proprio               | combinacao 3 |
| `t05verify-unpub-arch` | false | true  | proprio               | combinacao 4 |

## 3. Payloads reais capturados

ANTES do arquivamento:

```
[EVIDENCIA T-05] ANTES / feed sem filtro:  {"total":2,"ids":["t05verify-control","t05verify-control","t05verify-g1-anchor","t05verify-g1-anchor","t05verify-g1-sibling"]}
[EVIDENCIA T-05] ANTES / feed com assetId: {"total":2,"ids":["t05verify-control","t05verify-control","t05verify-g1-anchor","t05verify-g1-anchor","t05verify-g1-sibling"]}
```

As duas linhas `isPublished:false` (`unpub-live`, `unpub-arch`) **nunca
aparecem** — combinacoes 3 e 4 provadas contra banco real.

Arquivamento via `PATCH /api/v1/admin/news/t05verify-g1-anchor` com
`{"isArchived": true}` (HTTP 200). Estado do grupo logo apos:

```
[EVIDENCIA T-05] PATCH admin / estado do grupo apos arquivar: [{"id":"t05verify-g1-anchor","isPublished":true,"isArchived":true},{"id":"t05verify-g1-sibling","isPublished":true,"isArchived":true}]
```

> Este e o achado que justifica a T-05 inteira: **arquivar NAO zera
> `isPublished`**. As linhas seguem `isPublished: true`. Sem `isArchived: false`
> no `where`, o feed publico continuaria servindo-as.

DEPOIS do arquivamento:

```
[EVIDENCIA T-05] DEPOIS / feed sem filtro:  {"total":1,"ids":["t05verify-control","t05verify-control"]}
[EVIDENCIA T-05] DEPOIS / feed com assetId: {"total":1,"ids":["t05verify-control","t05verify-control"]}
[EVIDENCIA T-05] DEPOIS / feed com ticker:  {"total":1,"ids":["t05verify-control","t05verify-control"]}
```

`total` caiu de 2 para 1, o grupo alvo (ancora **e** irmao) desapareceu dos tres
caminhos, e o controle permaneceu. Resultado: `Tests: 3 passed, 3 total`.

## 4. Mutation check (a conferencia nao e tautologica)

Para provar que os testes reprovam de fato o defeito, o filtro foi removido
temporariamente do handler (as 2 ocorrencias de `isArchived: false` e a linha
`n.is_archived = false` do SQL raw) e as suites foram reexecutadas:

| Suite | Com filtro | Sem filtro (mutante) |
|---|---|---|
| `tests/unit/news-feed-archived-filter.test.ts` | 6 passed | **6 failed** |
| `tests/integration/news-feed-archived-real-db.test.ts` | 3 passed | **1 failed** (exatamente o "DEPOIS de arquivar") |

O handler foi restaurado com `git checkout --` e reconferido (2 ocorrencias de
`isArchived: false` + 1 de `n.is_archived = false`); ambas as suites voltaram ao
verde. Na mesma passada os casos 3 e 4 do teste unitario deixaram de ser
tautologicos: antes so afirmavam `data.length === 0` sobre um mock vazio; agora
avaliam o `where` realmente enviado ao banco (`rowPassesWhere`).

## 4b. Guard de seguranca do proprio teste

Revisao adversarial (Codex) apontou que `T05_REAL_DB=1` sozinho seria um guard
fraco: `wipe()` executa `deleteMany` real, entao um `DATABASE_URL` de dev ou
producao no ambiente faria o teste apagar linhas fora do escopo. Corrigido com
guard **fail-closed** no nome do banco: a suite so executa contra um banco cujo
nome (normalizado, ignorando `_`/`-`) contenha `t05verify`.

Comprovado nos dois sentidos:

| `DATABASE_URL` -> banco | Resultado |
|---|---|
| `footstock_t05_verify` | `Tests: 3 passed, 3 total` |
| `foot_stock_dev` | recusa antes de qualquer query — `Tests: 0 total`, com a mensagem `[T-05] Recusado: ... Banco alvo: "foot_stock_dev".` |

Como a recusa acontece no carregamento do modulo, `wipe()` nunca chega a rodar
no banco errado.

Outros dois pontos da mesma revisao tambem foram aplicados: o caminho `?ticker`
passou a afirmar que o controle **permanece** (senao uma regressao que zerasse o
feed inteiro passaria como "o alvo sumiu"), e o caso "DEPOIS de arquivar" ganhou
assercao de pre-condicao, para que rodar fora de ordem falhe dizendo o motivo em
vez de acusar o filtro do handler.

## 5. Gates e pendencias

- `npx tsc --noEmit` **no commit `8f3a08b` (HEAD limpo, worktree isolado): zero
  erros**. Na arvore de trabalho aparecem 5 erros `TS2322` sobre
  `sentimentScore: Decimal | null` em rotas de `assets`/`market` — originados de
  alteracao **nao commitada** que adiciona `sentimentScore?: number | null` a
  `AssetListItem` em `src/types/market.ts`. Fora do escopo da T-05 (que nao
  tocou nenhum desses arquivos).
- Suite completa do pacote: `104 passed, 3 skipped` / `1243 passed`. O teste de
  banco real fica **skipped por default** (sem `T05_REAL_DB=1`), entao nao
  quebra `npm test` nem CI em ambiente sem banco.
- Pendente e fora do escopo da T-05 (merecem itens proprios):
  - `src/app/(app)/mercado/[ticker]/page.tsx` (~L90) consulta `isPublished: true`
    **sem** `isArchived: false` — mesmo defeito, outra superficie publica.
  - Conferencia na camada de deploy (build/cache/CDN) quando existir staging real.
