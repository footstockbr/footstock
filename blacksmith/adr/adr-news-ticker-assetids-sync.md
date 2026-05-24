---
id: adr-news-ticker-assetids-sync
titulo: Sincronizacao de ticker e assetIds no modelo News
data: 2026-05-23
responsavel: Pedro Corgnati
status: aprovado
opcao: A
source_ref: "blacksmith/brainstorm-mcp/05-23-analise-badge-sem-time-noticias.md#2-decisao-bloqueante"
---

# ADR: Sincronizacao de ticker e assetIds no modelo News

## Decisao

**Opcao A: ticker e assetIds sempre sincronizados.**

Toda criacao de `News` grava `ticker` (string do clube) e `assetIds` (array com o `Asset.id` UUID correspondente). O motor Railway resolve `Asset.id` via query antes de criar o registro. O `NewsInjectionService` usa o objeto `asset` ja disponivel no escopo.

## Justificativa

Os quatro consumidores de `assetIds` — `NewsInjectionService`, `GET /api/v1/news`, pagina de mercado `[ticker]` e portal do clube `comunicados` — filtram por `assetIds: { has: asset.id }` usando UUID, nunca por ticker string. Gravar `classified.ticker` diretamente em `assetIds` torna as noticias externas invisiveis em todos esses feeds (falso negativo critico). A Opcao A corrige o problema na origem, com mudanca cirurgica nos dois produtores de News.

## Implicacoes por task

- **task-003**: `NewsPublisher.ts` — adicionar resolucao de `Asset.id` antes do `news.create`; gravar `ticker` e `assetIds: [assetId]`
- **task-005**: `NewsInjectionService.ts` — adicionar `ticker: asset.ticker` no `news.create` (asset ja disponivel)
- **task-008**: `batch-resolve/route.ts` — estender para gravar `assetIds` junto com `ticker` apos resolve
- **task-009**: backfill — executar somente apos tasks 003, 005 e 008 deployadas

## Opcoes descartadas

| Opcao | Motivo do descarte |
|---|---|
| B: ticker para admin, assetIds para feeds | Sincronizacao lazy gera inconsistencias; dois campos com semanticas diferentes sem invariante garantida |
| C: deprecar ticker, usar somente assetIds | Maior escopo; exige refatorar UI admin; descartado por ora, pode ser retomado em ciclo futuro |
