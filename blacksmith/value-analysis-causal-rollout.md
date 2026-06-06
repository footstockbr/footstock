# Rollout - causalidade da analise de valor

Data: 2026-06-06

## Preflight

- Confirmar colunas `price_history.source` e `price_history.attribution`.
- Confirmar schemas Prisma sincronizados para `PriceHistory` e indice de `orders`.
- Validar canario `attribution.version=2` pelo parser runtime.
- Confirmar metricas: `motor_price_attribution_missing_total`, `motor_tick_duration_ms`, `order_flow_snapshot_duration_ms`, `price_attribution_payload_bytes`, `value_analysis_movements_total`, `value_analysis_attribution_coverage_pct`, `news_injection_duplicate_total`.

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
- Em modo nao estrito, candle continua persistindo com degradacao/metricas em vez de derrubar o motor.

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
