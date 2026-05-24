---
id: adr-news-multi-clube
titulo: Regra de associacao para noticias multi-clube
data: 2026-05-23
responsavel: Pedro Corgnati
status: aprovado
opcao: 3a
source_ref: "blacksmith/brainstorm-mcp/05-23-analise-badge-sem-time-noticias.md#passo-3--decidir-regra-para-noticias-multi-clube"
---

# ADR: Regra de associacao para noticias multi-clube

## Decisao

**Opcao 3a: primeiro ticker encontrado no mapeamento de aliases.**

Para noticias que mencionam multiplos clubes (ex: "Flamengo x Palmeiras"), o sistema associa o primeiro ticker encontrado durante a varredura de aliases. A ordem de iteracao do `prisma.asset.findMany` na camada 1 de `resolveTickerFromText` nao tem `orderBy` definido; o comportamento depende do planejador do Postgres.

hipotese: a ordem real em producao depende de `search_text` dos ativos. Este ADR documenta o comportamento aceito — nao o comportamento garantido.

## Exemplo concreto

Para a noticia "Flamengo x Palmeiras":
- `ticker` esperado: o primeiro clube cujo `search_text` no DB contiver match com o texto da noticia. Se ambos tiverem `search_text` populado com igual especificidade, o resultado depende da ordem do Postgres.
- `assetIds` esperado: `[uuid_do_asset_do_ticker_vencedor]`
- **Comportamento correto documentado**: um clube associado, badge exibe o ticker vencedor, noticia visivel no feed do clube vencedor.

## Justificativa

Opcao 3a tem o menor escopo de implementacao e nao requer mudancas no `NewsClassifier`. O nao-determinismo (H-4 do documento de analise) e aceitavel para a correcao atual: qualquer associacao e melhor do que `ticker = null`. Opcoes 3b/3c requerem o `NewsClassifier` retornar lista rankeada de tickers — fora do escopo deste ciclo.

## Implicacoes por task

- **task-008**: nao requer mudanca adicional alem da resolucao de `Asset.id` — o `resolveTickerFromText` ja retorna o primeiro ticker encontrado
- **task-009**: backfill de noticias multi-clube recebe o comportamento 3a automaticamente via `batch-resolve`
- **Melhoria futura**: adicionar `orderBy: { ticker: 'asc' }` no `findMany` de `resolveTickerFromText` para determinismo; abrir task separada quando necessario

## Opcoes descartadas

| Opcao | Motivo do descarte |
|---|---|
| 3b: maior relevancia do Sonnet | Requer retorno estruturado do NewsClassifier com scores por ticker; fora do escopo |
| 3c: multiplos tickers via assetIds | Requer NewsClassifier retornar lista; exige refatorar contrato ClassifiedNews |
| 3d: nao associar confrontos | Exige nova badge na UI admin; decisao de produto fora do escopo da correcao de bug |
