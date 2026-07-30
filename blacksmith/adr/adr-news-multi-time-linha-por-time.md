---
id: adr-news-multi-time-linha-por-time
titulo: Desenho B para noticias multi-time (linha por time, agrupada)
data: 2026-07-30
responsavel: Pedro Corgnati
status: aprovado
opcao: B
source_ref: "blacksmith/loop-archives/07-28-noticias-multi-time-linha-por-time/source.md#10.5-veredito"
---

# ADR: Desenho B para noticias multi-time (linha por time, agrupada)

## Decisao

**Desenho B: N linhas em `news`, uma por time, agrupadas por `group_id`/`group_rank`, unificadas no card.**

Adotado como `DB-01` (`source.md:1080`), **condicionado** as nove condicoes nao
negociaveis C1..C9 (`source.md:870-882`) e ao gatilho de reversao de 5 sinais
registrado na mesma secao (`source.md:884`, reproduzido verbatim abaixo). A
v1.0.0 registrava esta decisao como incondicional; a v2.0.0 a tornou
condicional a C1..C7; a v3.0.0 acrescentou C8 (higiene pre-requisito do
resolver de ticker e do estado de erro do feed) e C9 (escritores de
`assetIds` e crons aprendendo semantica de grupo antes do flag ligar).

Resumo das nove condicoes (texto completo em `source.md:870-882`, nao
reproduzido aqui para nao divergir do original por paginacao):

| # | Condicao (resumo) |
|---|---|
| C1 | `groupId`/`groupRank` nos dois schemas Prisma na mesma entrega, motor rebuildado antes de escrever campo novo |
| C2 | Guard de drift do model `News` entre os dois schemas, bloqueante |
| C3 | `NewsPublisher` falha ruidosamente (log estruturado + metrica + item nao marcado processado) |
| C4 | Escrita das N linhas em transacao unica, despacho Redis apos commit, estado de despacho persistido |
| C5 | Consulta agrupada entregue antes ou junto do fan-out, nunca depois |
| C6 | Constraints corretas para `ticker` nullable (indice parcial) e ordenacao com chave secundaria estavel |
| C7 | Operacoes de admin por grupo em editar, publicar e arquivar |
| C8 | Higiene pre-requisito: paridade do resolver de ticker restaurada + estado de erro do feed distinto do vazio |
| C9 | Todos os 9 escritores de `assetIds` (censo corrigido pos-item-006) e o cron de sentimento aprendem semantica de grupo antes do flag multi-time ligar |

## Opcoes consideradas

| Desenho | Descricao | Motivo do descarte / adocao |
|---|---|---|
| **A** | Uma linha em `news`, N linhas em tabela satelite de impactos (proposta do arquivo irmao) | Descartado: sinal invertido nos 6 leitores escopados por ativo (`source.md:521-523,857`) |
| **B** | N linhas em `news`, uma por time, agrupadas por vinculo, unificadas no card | **Adotado** (`DB-01`, `source.md:1080`) |
| **C** | `News` editorial + `NewsImpact` satelite + outbox de eventos, com projecao de compatibilidade | Levantado na revisao adversarial (`source.md:521-523`); rejeitado como entrega — reintroduz o risco de sinal invertido do desenho A por outro caminho (`source.md:750-812,1294`) |

O que o desenho A ainda faz melhor, registrado honestamente (`source.md:840`):
uma noticia continua sendo uma coisa so. A critica mais forte contra B, aceita
como legitima pelo proprio `source.md`, e que ele evita uma tabela satelite
explicita criando uma **tabela satelite implicita dentro da propria `news`**
(`groupId + groupRank + assetIds[0] + sentiment`), sem integridade relacional
propria. O custo nao desaparece: reaparece em paginacao, admin e consistencia
editorial.

## Justificativa

**Argumento decisivo** (`source.md:857`): o desenho B elimina **por
construcao** o risco mais grave do desenho A — sinal invertido nos 6 leitores
escopados por ativo (censo em 19.4 do `source.md`), dois dos quais alimentam
decisao de compra do usuario. Este e um argumento de **corretude**, nao de
esforco. Nao toca na matematica de preco: `MarketEngine`, `L7`, `L10` e
`PriceAttribution` ficam intactos.

**Trade-off honesto, nao dominancia** (`source.md:1300`): o desenho B compra
corretude imediata por ativo ao preco de duplicacao editorial e de
invariantes de grupo que o banco so garante parcialmente (CHECK/indices
parciais nao expressos no Prisma — ver comentario no `schema.prisma` do
model `News`). Este ADR registra essa troca de olhos abertos: o gatilho de
reversao abaixo existe exatamente para o caso de o preco subir.

## Relacao com o ADR anterior

Este ADR **nao revoga nem sobrescreve** [`adr-news-multi-clube.md`](./adr-news-multi-clube.md)
(regra de associacao 3a — primeiro ticker encontrado no mapeamento de
aliases). O ADR anterior continua valido para o caminho **mono-time**: uma
noticia que menciona multiplos clubes sem gerar fan-out estruturado (ex: uma
noticia informativa que apenas cita dois clubes de passagem) segue associando
pelo comportamento 3a documentado ali. O desenho B deste ADR se aplica
especificamente ao caso estrutural de **noticia com fan-out por time**
(evento esportivo com efeito oposto declarado para cada lado), roteado pelo
classificador para `writeNewsGroup` (`newsGroupWriter.ts`) em vez do caminho
de linha unica.

## Gatilho de reversao

Copiado verbatim de `source.md:884` (nao resumido, por exigencia do proprio
runbook de governanca deste item):

> Se durante F1 a F4 aparecer qualquer um dos sinais abaixo, parar e reavaliar
> o desenho C (secao 16) antes de continuar: (a) a hidratacao de irmaos
> exigir mais de duas queries por pagina; (b) surgir requisito de edicao
> colaborativa, versionamento ou traducao de noticia; (c) o admin por grupo
> exigir mais de uma rota nova alem das duas previstas; (d) o golden set de
> H8 mostrar acerto de sinal por time abaixo de 85%; (e) **[v3.0.0]** o
> inventario de escritores de `assetIds` crescer alem dos 8 de 19.4 durante a
> implementacao, sinal de que a superficie de escrita e maior do que o censo
> capturou.

Nota de rastreabilidade sobre o sinal (e): o censo de escritores **ja
cresceu** de 8 para 9 durante a implementacao (item 006, ver `source.md:878`
"censo corrigido pos-item-006"). Isso ja e o proprio sinal (e) do gatilho,
ocorrido e resolvido: o operador, via `/tools:listener-recovery` anterior a
este item, decidiu **aceitar o censo corrigido (9) e seguir o loop**, em vez
de reabrir o desenho C. Este ADR nao reabre essa decisao; apenas a registra
para quem ler este documento no futuro.

## Nota de substituicao de ticker (PAL3 -> POR3)

O runbook original deste item (`source.md:1138`, decisao D7) usa o cenario de
exemplo "PAL3 goleia URU3 4x0" para descrever o comportamento esperado do
fan-out multi-time em producao. Durante a execucao deste item, a Stop
Condition #2 do runbook (`task-023-governanca-documentacao.md`) detectou que
**`PAL3` nao e um `Asset.ticker` real** deste projeto — existe somente como
alias de busca em `AssetAlias`, resolvendo para o ticker fictício real
`POR3` (Porco do Parque FC, ver `assets.seed.ts`). `URU3` (Urubu da Gavea FC)
e um ticker real.

Decisao do operador (2026-07-30, registrada em `_ITERACTION-LOG.md` item 023
e no snapshot de recovery `blacksmith/recovery/context/20260730T162837Z-interactive-VERIFY_FAILED.md`):
`PAL3` **nao deve aparecer como valor de dado** em nenhum artefato deste
item (codigo, seed ou documentacao) — apenas em prosa explicativa sobre a
substituicao, como neste paragrafo. Todo artefato produzido por este ADR e
pelos itens ST003..ST011 usa `POR3` no lugar de `PAL3` em qualquer campo de
dado, exemplo JSON ou seed. O cenario e citado como **"POR3 goleia URU3
4x0"**, preservando a mesma invariante (2 linhas, mesma `impactCategory`,
sentimento oposto) que `source.md:1138` descreve para o par original.

## Apendice - rastreabilidade dos 50 criterios de aceite

Formato: `| # | descricao curta | artefato/secao que documenta ou item que
verifica |`. Fonte dos 50 criterios: `source.md:960-1009`. Status de cada
item citado (`[x]` concluido, `[!]` pendente/nao concluido) e o estado real
registrado em `PROGRESS.md` (tabela de items, linhas 11-37) na data deste
ADR — reproduzido aqui para nao passar falsa impressao de cobertura total.
Criterios cobertos por item `[!]` estao **documentados, nao verificados em
producao**; a verificacao final desses fica para os itens 024 (fechamento
verificado local) e 025-027 (D0-D8, deploy).

| # | Descricao curta | Artefato / item |
|---|---|---|
| 1 | 3 times = 3 linhas, mesmo group_id, ranks 0/1/2 | `newsGroupWriter.ts` (FDD §4.1); verificado por item 018 [x] |
| 2 | Falha em qualquer linha reverte o grupo inteiro | `writeNewsGroup` usa `$transaction`; verificado por item 018 [x] |
| 3 | 3 linhas compartilham impactCategory, sinal difere | seed `news-multi-team.seed.ts` (ST010); documentado por item 018 [x] |
| 4 | Nenhum impacto elegivel fica sem despacho | `impactDispatchedAt`; verificado por item 014 [x] (falha ruidosa do estado de despacho) |
| 5 | Nenhum arquivo sob motor/src/engine alterado, exceto supressao de correlacao | verificado por item 021 [x] |
| 6 | Publisher nao falha em silencio | verificado por item 014 [x] |
| 7 | /noticias sem filtro retorna cards, nao linhas | item 015 [!] (consulta agrupada da rota feed, pendente) |
| 8 | pagination.total conta grupos | item 015 [!], documentado em API-CONTRACT.md §news (ST008) |
| 9 | Ordenacao estavel sob empate de published_at | item 015 [!] |
| 10 | Nenhum grupo aparece em duas paginas | item 015 [!] |
| 11 | Filtro por ticker retorna a linha certa com badges dos irmaos | item 016 [!] (card badge por time, pendente) |
| 12 | Filtro por impact que casa so num irmao nao perde o grupo | item 015 [!] |
| 13 | Busca textual que casa so num irmao nao perde o grupo | item 015 [!]; pre-condicao documentada se a rota nao tiver busca textual hoje |
| 14 | Ancora arquivada nao produz grupo fantasma | item 017 [!] (rotas admin group-safe, pendente) |
| 15 | Card exibe uma badge por time | item 016 [!] |
| 16 | Coluna clicks permanece inalterada | item 016 [!] |
| 17 | Noticia de time unico continua identica em todas as superficies | caminho de linha unica de `writeNewsGroup`; verificado por item 018 [x] |
| 18 | Unicidade (group_id, group_rank) rejeita 4a linha e rank duplicado | migration M067; verificado por item 007 [x] |
| 19 | ticker NULL nao burla a idempotencia | migration M067; verificado por item 007 [x] |
| 20 | Duplicata do mesmo ticker no grupo falha | migration M067; verificado por item 007 [x] |
| 21 | Admin lista grupos, nao linhas | item 017 [!] |
| 22 | Admin PATCH e DELETE tem escopo de grupo por padrao | item 017 [!]; formulario/janela verificado por item 018 [x] |
| 23 | Edicao individual restrita a ticker e sentiment | item 017 [!] |
| 24 | Cron do Next nao sobrescreve sentimento por time | item 020 [!] (crons group-safe, pendente) |
| 25 | mobile-expo segue fora do escopo | verificado por item 006 [x] (preflight/censo) |
| 26 | Correlacao entre ativos do mesmo grupo e suprimida | verificado por item 021 [x]; exemplo usa POR3/URU3 (ver nota de substituicao acima), nao PAL3 |
| 27 | groupId chega ao motor sem campo novo no contrato (correlationId=groupId) | verificado por item 021 [x] |
| 28 | Backfill e idempotente | verificado por item 008 [x] (checksum antes/depois identico em dupla execucao) |
| 29 | Reconciliador cobre o caminho RSS | nao coberto por item dedicado no loop; pendente dos itens 025-026 (D5/D6 de deploy) |
| 30 | Drift do model News entre os dois schemas e bloqueante | item 010 [!] (guard de drift, pendente) |
| 31 | Classificador acerta o sinal por time no golden set >= 85% | **nao cumprido**: retirado do item 012 e rastreado a parte em `H8-GOLDEN-SET-GRAVADO-BACKLOG.md` e `pending-actions/foot-stock.md` (PA-H8-01/02/03); bloqueante do item 026 (D7) |
| 32 | Migration de fato aplicada em producao | pendente; parte dos itens 025-027 (deploy) |
| 33 | Migration usa diretorio timestampado com numero correto | localmente verificado por item 007 [x]; aplicacao em producao pendente (ver #32) |
| 34 | Motor sobe saudavel apos o rebuild | pendente do item 026 (D7) |
| 35 | Nenhuma linha com group_id ou group_rank nulo | trigger + backfill; verificado localmente por itens 007/008 [x]; producao pendente |
| 36 | Motor grava sentimentClassifiedAt na propria escrita | item 013 [!] (publisher transacional fan-out, pendente) |
| 37 | reconcile-null-tickers preserva assetIds multi-time | item 020 [!] |
| 38 | batch-resolve preserva assetIds multi-time | item 019 [!] / item 020 [!] |
| 39 | DELETE nao deixa grupo mutilado | item 020 [!] |
| 40 | Bloco compartilhado do resolver e identico nos dois arquivos | verificado por item 003 [x] (teste de paridade por hash, falha antes/passa depois) |
| 41 | Feed publico distingue erro de vazio | verificado por item 004 [x] |
| 42 | Estado vazio continua aparecendo quando a lista e legitimamente vazia | verificado por item 004 [x] |
| 43 | Ticker desconhecido nao devolve o feed inteiro | item 015 [!] |
| 44 | Clique na badge filtra e nao expande o card | item 016 [!] |
| 45 | Teclado funciona nos dois controles (badge e expansao) | item 016 [!] |
| 46 | Janela do admin nao encolhe silenciosamente | verificado por item 018 [x] (formulario/janela admin group-safe) |
| 47 | Fallback deterministico continua mono-time e isso e explicito | item 011 [!] (classificador multi-time parser, pendente) |
| 48 | Nenhum data-testid novo colide com os existentes | item 005 [!] (selectors E2E, pendente) |
| 49 | Selectors E2E mortos corrigidos ou removidos | item 005 [!] |
| 50 | E2E de /noticias afirma conteudo, nao so ausencia de erro | item 005 [!] |
