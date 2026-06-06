# Baseline causal - analise de valor

Data: 2026-06-06

## Periodo

- Periodo alvo: janela selecionada pela API admin.
- Denominador: movimentos retornados com `rawChange !== 0`.
- Meta inicial: cobertura causal direta >= 99% para candles novos `source='MOTOR'`; meta provisoria ate medicao real por volume de candles.

## Query de cobertura

```sql
SELECT
  COALESCE(source, 'REAL') AS source,
  COUNT(*) AS total,
  COUNT(attribution) AS with_attribution,
  ROUND((COUNT(attribution)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) AS attribution_pct
FROM price_history
GROUP BY COALESCE(source, 'REAL')
ORDER BY source;
```

## Performance

- `motor_tick_duration_ms`: registrar p50, p95 e p99 antes e depois do snapshot causal de ordens.
- `order_flow_snapshot_duration_ms`: registrar p50, p95 e p99 por janela de 1 hora.
- Amostra minima: 20 movimentos. Se houver menos de 20 movimentos, registrar volume insuficiente e nao alegar melhoria.

## Coleta executavel

```bash
npx tsx scripts/value-analysis-causal-baseline.ts \
  --from 2026-06-06T00:00:00.000Z \
  --to 2026-06-07T00:00:00.000Z \
  --metrics-json ./tmp/motor-tick-metrics.json
```

O script reescreve este arquivo com `Resultado medido.` somente quando existe banco acessivel, amostra de `motor_tick_duration_ms` e consulta real de cobertura por `source`.

## Estado atual

hipotese: o workspace local nao possui conexao de banco de producao/staging nesta execucao, portanto este arquivo registra o contrato de baseline e a query obrigatoria. A medicao real deve ser anexada antes de ativar `ATTRIBUTION_STRICT_MODE=true`.

## Resultado exigido por rollout

- `period`: ISO inicio/fim.
- `source`: `MOTOR`, `GBM`, `REAL` ou legado.
- `denominator`: movimentos com `rawChange !== 0`.
- `p50/p95/p99`: loop do motor e snapshot de ordens.
- `sample`: 20 movimentos ou justificativa objetiva de volume insuficiente.
