# Rollout - causalidade da analise de valor

Data: 2026-06-06
Ultima atualizacao: 2026-09-03 (modo estrito ativado em producao + correcao da semantica da flag)

## Preflight

- Confirmar colunas `price_history.source` e `price_history.attribution`.
- Confirmar schemas Prisma sincronizados para `PriceHistory` e indice de `orders`.
- Validar canario `attribution.version=2` pelo parser runtime.
- Confirmar metricas: `motor_price_attribution_missing_total`, `motor_price_attribution_missing_parse_total`, `motor_price_attribution_missing_column_total`, `motor_tick_duration_ms`, `order_flow_snapshot_duration_ms`, `price_attribution_payload_bytes`, `value_analysis_movements_total`, `value_analysis_attribution_coverage_pct`, `news_injection_duplicate_total`.
- Alerta: `motor_price_attribution_missing_total > 0` em janela de teste deve abrir investigacao; usar `_parse_total` vs `_column_total` para separar falha de serializacao de coluna indisponivel.

## Performance

- Comparar p50/p95/p99 de `motor_tick_duration_ms` contra `value-analysis-causal-baseline.md`.
- Validar `EXPLAIN` da query agrupada por `asset_id`; proibida query por ativo no loop.
- Se p95 aumentar mais que 10%, manter `ORDER_FLOW_SNAPSHOT_ENABLED=false` ate ajuste ou aprovacao explicita de produto/infra.

## Seguranca

- Snapshot, attribution e logs nao podem conter email, nome, saldo, IP, session id, CPF, telefone ou payload bruto de usuario.
- Apenas ids tecnicos de ordens podem entrar no rastro causal, limitados a 10 por candle.

## Rollback

- Desativar snapshot: `ORDER_FLOW_SNAPSHOT_ENABLED=false`.
- Desativar modo estrito: `ATTRIBUTION_STRICT_MODE=false`.
- Em producao (Railway), cada um e um comando so, e a escrita da variavel ja dispara
  redeploy do servico: `railway variables --service motor --set "ATTRIBUTION_STRICT_MODE=false"`.
- Em modo nao estrito, candle continua persistindo com degradacao e metricas
  (`motor_price_attribution_missing_total` e os dois contadores por causa). Ver a secao
  seguinte para o que o modo estrito de fato faz -- **nao** e "derrubar o motor".

## O que o modo estrito faz de verdade (corrigido em 2026-09-03)

Ate 09-03 esta secao nao existia e a linha de rollback afirmava que o modo estrito
derruba o motor. **Isso estava errado** e subestimava o risco. A flag tem TRES pontos de
efeito, e so um deles para o motor:

1. **Gate de boot** -- `MarketEngine.start()`. Preflight vermelho com a flag ligada lanca
   e o motor nao sobe. Este e o unico site que se comporta como o nome sugere, e o
   comportamento e deliberado (a decisao esta comentada no proprio `start()`).
2. **Parser invalido no tick** -- `persistPriceHistory`, ramo `!parsed.ok`.
3. **Coluna `attribution` indisponivel** -- `persistPriceHistory`, ramo do catch.

Os sites 2 e 3 **nao derrubam o motor**. O chamador no loop de tick e
`this.persistPriceHistory(tick, attr).catch((err) => logger.error(...))`, entao o throw
do modo estrito vira uma linha de log e **o candle e descartado**. O motor segue
reportando ONLINE, e o buraco em `price_history` nao tem nenhum outro sinal.

Consequencia contra-intuitiva que precisa estar clara para quem opera: nesses dois casos
o modo estrito e **menos** observavel que o modo nao estrito. Em modo nao estrito o candle
entra degradado e incrementa `motor_price_attribution_missing_parse_total` /
`_column_total`; em modo estrito ele some e so resta `persistPriceHistory fail` no log.

Se aparecer buraco em `price_history`, checar nesta ordem: (a) a flag esta ligada?
(b) tem `persistPriceHistory fail` no log do motor na mesma janela? So depois investigar
ingestao.

## Gate executavel

```bash
ORDER_FLOW_SNAPSHOT_ROLLBACK_TESTED=true npx tsx scripts/value-analysis-causal-rollout-check.ts
```

O gate valida baseline medido, `EXPLAIN (ANALYZE, BUFFERS)` da query agrupada de ordens, volume minimo de 40 ativos, rollback por env e sanitizacao minima de PII antes de ativar modo estrito.

## Ativacao de modo estrito

`ATTRIBUTION_STRICT_MODE=true` so pode ser ativado depois de:

- Preflight completo aprovado.
- 24h de staging ou volume minimo defensavel sem candle novo `source='MOTOR'` sem attribution.
- Rollback por env validado.
- Nenhuma ocorrencia persistente de `UNKNOWN_DEGRADED_REASON` na janela de teste.

### Ativado em producao: 2026-09-03 02:25Z

Estado atual: `ATTRIBUTION_STRICT_MODE=true` no servico `motor` (Railway). Container
`motor-e69437ab-...-1788402336989`, lideranca as 02:25:47Z (fencing token 37), boot sem
`STRICT_MODE bloqueado` e sem `Preflight de atribuicao degradado`.

As precondicoes acima foram checadas contra producao, somente-leitura, antes de ligar:

- **Preflight aprovado.** O canario transacional voltou a passar em 09-03 depois do fix do
  cast `enumlabel::text` (commit `39c4a1f`). Antes disso ele estava vermelho desde 06-06,
  pelo motivo errado: a query do catalogo estourava antes do INSERT sob o driver adapter
  `PrismaPg`, entao o check morria sem nunca exercitar escrita, releitura de JSONB nem
  round-trip do parser. Ou seja, **este gate nunca tinha passado de verdade em producao**
  quando esta lista foi escrita, em 06-06.
- **Volume sem candle degradado.** 590.216 candles `source='MOTOR'` em 7 dias: zero com
  `attribution IS NULL`, zero com `tickId LIKE 'degraded:%'`, zero com
  `confidence = 'baixa'`, zero com `version <> 2`. Os unicos `qualityFlags` presentes sao
  informativos (`ORDER_FLOW_SNAPSHOT_UNAVAILABLE`, `ORDER_FLOW_INELIGIBLE_ONLY`,
  `NEWS_QUEUE_AGGREGATED`), nenhum de falha de parser.
- **Rollback por env validado.** Comando unico, ver secao Rollback.
- **Sem degradacao persistente** na janela medida.

Verificacao pos-ativacao: 70 candles no primeiro minuto apos a troca de container, zero
sem attribution, zero degradados, zero `persistPriceHistory fail`.

Nota sobre `scripts/value-analysis-causal-rollout-check.ts`: o gate assere
`ATTRIBUTION_STRICT_MODE !== 'true'` porque e um gate **pre-ativacao**, feito para rodar
com a flag desligada. Com a flag ja ligada em producao, rodar o gate exige desligar a
variavel no shell da execucao -- isso nao indica regressao.
