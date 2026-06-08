# Análise de Valor — diagnóstico causal profundo e plano de melhoria

Data: 2026-06-08
Aba alvo: `admin/analise-de-valor`
Autoria: depuração via persona `code-debugger` + pesquisa via persona `study-researcher`

## Status de implementação (2026-06-08)

Implementados nesta sessão (A parcial, C, e o bug do backfill):
- **A3** — contadores granulares `motor_price_attribution_missing_parse_total` e `_column_total` (`motor/src/utils/logger.ts`, `motor/src/engine/MarketEngine.ts`) + alerta documentado no rollout.
- **C9/C10** — `value-analysis.ts` reconhece `source='MOTOR'` (`isEngineSource`); candle MOTOR sem atribuição aceita vira falha operacional com `degradedOwner` `ENGINE`/`MIGRATION` e mensagem específica (`parseReason`, source, coluna, flags), nunca a frase genérica nem `UNKNOWN`. Comentário stale de `source` corrigido no schema Next.
- **C12** — texto `!hasOrderFlow` reescrito: ordens preenchidas são evidência pós-preço, não causa direta.
- **Backfill** — `scripts/backfill-price-attribution.ts` reescrito: itera TODOS os candidatos em lotes por cursor (antes `take:100`+`slice(0,10)`=10 linhas), relatório por `source`, GBM sintético + legado honesto, MOTOR pulado de propósito (defeito deve permanecer visível).

Validação: jest verde (Next value-analysis 17/17 incl. 2 novos testes MOTOR; motor PriceAttribution+Preflight 8/8); `tsc --noEmit` limpo em motor, footstock-next e backfill (exigiu `prisma generate` na raiz — client estava stale vs schema).

Não implementados (operacionais/produto): A1 (medir baseline em banco), A2 (ligar `ATTRIBUTION_STRICT_MODE` em staging), A4 (gate de deploy do preflight — código já existe em `start()`), B/D/E.

---

## 0. Sintoma reportado

A aba às vezes entrega a explicação genérica:

> "Não houve notícia nem ação administrativa na janela, e também não encontrei ordens preenchidas no intervalo exato do candle. A leitura correta é: o histórico de preço registrou volume agregado, mas a causa direta não está auditável por ordem individual; a explicação fica como fluxo de mercado com baixa confiança, possivelmente vindo de ticks agregados do motor ou liquidez fora da janela de correlação."

Objetivo: o motor e os processos a montante devem garantir que a aba mostre **o motivo real** da mudança de preço, nunca essa frase genérica de baixa confiança.

---

## 1. Onde a frase nasce (fato, com evidência)

Fato: a frase não vem do motor. Vem do reconstrutor do lado Next:

- `footstock-next/src/lib/admin/value-analysis.ts:520-539` — `buildMarketFlowExplanation`, ramo `!hasOrderFlow`.
- `footstock-next/src/lib/admin/value-analysis.ts:611-618` — quando `source !== 'REAL'`, `buildCause` embrulha essa frase dentro de "O candle foi gerado pela fonte X..." se houver `MovementContext`.
- `footstock-next/src/lib/admin/value-analysis.ts:622-630` — quando `source === 'REAL'` e há `volumeDelta > 0`, o fallback `MARKET_FLOW` usa a mesma frase.
- `footstock-next/src/lib/admin/value-analysis.ts:386-419` — `classifyEvidence` só usa `fallbackCause.explanation` quando `parseEngineAttribution` não gerou rastro causal aceito.
- `footstock-next/src/app/api/v1/admin/value-analysis/route.ts:615-645` — a rota parseia `point.attribution`; se `ok === false`, `engineAttribution` vira `null` e a resposta passa a usar o fallback.

Conclusão de fato: **a frase genérica é caminho degradado/reconstruído.** Ela aparece quando o candle analisado não carrega uma atribuição do motor aceita pelo parser e também não cai em uma exceção específica, como `source='GBM'`.

## 2. O motor já calcula causa operacional rica

Fato: `motor/src/engine/PriceAttribution.ts` produz `PriceAttributionV2` com:

- `primaryCause`/`primaryLayer`, derivados da maior contribuição de camada (`PriceAttribution.ts:187-190`, `333-365`).
- `causalEvents[]` para `NEWS`, `ORDER_FLOW`, `LAYER`, `CONTROL`, `SYNTHETIC_AGENT`, `CORRELATION` e `NUDGE` (`PriceAttribution.ts:239-330`).
- `primaryExplanation`, `evidenceSentence`, `caveatSentence`, `layerContributions` com `deltaPrice` e `contributionPct` (`PriceAttribution.ts:350-389`).
- `LAYER_CAUSES`, que mapeia camadas do motor para causas legíveis em PT-BR (`PriceAttribution.ts:59-74`).

Fato: `MarketEngine` calcula a atribuição antes do match de ordens preenchidas (`MarketEngine.ts:471-489`), acumula em `pendingAttributions` (`MarketEngine.ts:491-493`) e, quando persiste o candle, grava `source: 'MOTOR'` junto de `attribution` (`MarketEngine.ts:523-529`, `670-683`).

Interpretação: o problema principal não é ausência de gerador causal. O problema é cobertura e fidelidade do rastro até a aba: alguns candles chegam sem atribuição aceita, outros chegam com atribuição agregada que pode simplificar causas múltiplas.

## 3. Causas-raiz da frase genérica e da baixa fidelidade (ranqueadas)

### R1. Candle `MOTOR`/legado sem `attribution` aceita pelo parser (alta confiança)

Fato: se `point.attribution` é `null`, string JSON inválida, versão não suportada ou schema V2 inválido, `parseEngineAttribution` retorna `ok: false` (`value-analysis.ts:229-277`). A rota então usa fallback (`route.ts:615-645`).

Fato: em modo não estrito, `MarketEngine.persistPriceHistory` não bloqueia a operação quando a coluna `price_history.attribution` está indisponível: incrementa `motor_price_attribution_missing_total`, registra warning e persiste o candle sem atribuição (`MarketEngine.ts:655-664`). Com `ATTRIBUTION_STRICT_MODE=true`, essa condição derruba a persistência em vez de gerar candle sem rastro (`MarketEngine.ts:657-660`).

Correção sobre a versão anterior deste diagnóstico: falha de serialização da atribuição **não** vira necessariamente `attribution=null`. O código tenta gravar uma atribuição V2 degradada com `causalEvents: []` e `qualityFlags: [parsed.qualityFlag]` (`MarketEngine.ts:614-653`). A frase genérica é mais diretamente explicada por ausência/parse failure no lado da API ou por indisponibilidade da coluna na escrita.

### R2. Histórico legado/default `REAL` mascara a origem real do candle (alta confiança)

Fato: se a coluna `source` não existe, `getPriceHistory` projeta `'REAL'::text AS source` (`route.ts:297-330`). Se a coluna `attribution` não existe, projeta `NULL::jsonb AS attribution` (`route.ts:275-294`, `319-337`). Esse par (`source='REAL'`, `attribution=null`) encaminha movimentos com volume para `MARKET_FLOW` genérico.

Fato: as migrations adicionam `source` e `attribution` tardiamente (`prisma/migrations/M053_price_history_attribution/migration.sql:3-13`, `footstock-next/prisma/migrations/M056-price-history-attribution.sql:5-9`). Logo, candles anteriores ou bancos com drift podem não carregar rastro causal.

Fato: `source='GBM'` não explica a frase genérica atual por si só. O classificador trata GBM sem atribuição como `SYNTHETIC_HISTORY` e usa a mensagem específica "Candle sintetico..." (`value-analysis.ts:408-414`). GBM só vira parte do problema genérico se o `source` foi perdido/defaultado como `REAL`.

### R3. `source='MOTOR'` ainda não é tratado como primeiro cidadão no fallback (alta confiança)

Fato: o motor grava `source: 'MOTOR'` (`MarketEngine.ts:670-683`).

Fato: o schema raiz já documenta `'MOTOR'`, mas o schema Next ainda tem comentário stale `// 'GBM' | 'REAL'` (`prisma/schema.prisma:402`, `footstock-next/prisma/schema.prisma:523`). Como o preflight remove comentários ao comparar blocos Prisma, isso é drift de documentação/contrato humano, não necessariamente falha detectável por `AttributionPreflightService` (`AttributionPreflightService.ts:33-75`).

Fato: `sourceQualityFlag` só distingue ausência de coluna e `GBM`; qualquer outro source degradado cai em `UNKNOWN_DEGRADED_REASON` e `degradedOwner: 'UNKNOWN'` (`value-analysis.ts:329-333`, `402-419`). Um candle `MOTOR` sem atribuição aceita deveria apontar owner `ENGINE`/`PERSISTENCE`, não `UNKNOWN`.

### R4. O fallback de order-flow pergunta pelo evento errado (alta confiança)

Fato: a API procura ordens `FILLED`/`PARTIAL` por `executedAt`/`updatedAt`/`createdAt` dentro da janela do candle (`route.ts:510-545`) e calcula `orderFlow` em `route.ts:590-591`.

Fato: a regra causal do motor é outra: "Ordens executadas apos o calculo do preco nao entram em causalEvents.ORDER_FLOW; apenas snapshot pre-preco e elegivel como causa direta." (`PriceAttribution.ts:380-385`). O snapshot pré-preço busca ordens `OPEN`/`PARTIAL` existentes no início do tick (`OrderFlowSnapshotService.ts:61-79`) e é capturado antes do cálculo de preço (`MarketEngine.ts:351`, `394-489`), enquanto o match de ordens preenchidas ocorre depois (`MarketEngine.ts:500-504`).

Conclusão: "não encontrei ordens preenchidas" é uma evidência negativa fraca e, em muitos casos, enganosa. Para explicar preço do motor, a aba deve usar `orderFlowSnapshot`/camadas de motor, não ordens preenchidas pós-preço.

### R5. Backfill/processo de seed ainda não cobre todos os legados (média confiança)

Fato: o seed admin-demo atual já cria atribuição sintética explícita para GBM (`footstock-next/prisma/seeds/admin-demo/priceHistory.seed.ts:39-72`, `133-145`). Isso reduz o problema em ambientes re-semeados.

Fato: o script `scripts/backfill-price-attribution.ts` só monta `sample = candidates.slice(0, 10)` e, em `--write`, atualiza apenas esse sample (`scripts/backfill-price-attribution.ts:13-21`, `23-60`, `73-79`). Ele é útil como prova de formato, mas não é um backfill completo.

hipótese: ambientes que rodaram seeds/migrations antigas ainda têm volume relevante de `price_history.attribution IS NULL`; sem consulta real de staging/prod, a frequência não está comprovada nesta execução.

### R6. Merge de múltiplos ticks pode simplificar a causa real (hipótese)

Fato: para clusters que não são `A_TOP`, o motor persiste a cada `PERSIST_HISTORY_EVERY = 6` ticks (`MarketEngine.ts:34-35`, `518-522`). O merge soma `deltaPrice` líquido por camada e ordena por `abs(deltaPrice)` líquido (`PriceAttribution.ts:503-527`).

hipótese: sinais opostos de uma camada ao longo dos ticks podem se cancelar, deixando outra camada pequena porém direcional como `primaryCause`. O próprio caveat do merge reconhece que "sinais opostos podem ter sido simplificados pela causa primaria" (`PriceAttribution.ts:589-592`). Isso não causa a frase genérica, mas pode impedir a aba de mostrar a causa real em candles multi-causa.

## 4. Por que a frase genérica é semanticamente errada

Fato: num candle `MOTOR`, a causa operacional elegível é a camada que moveu o preço antes da persistência: OU, âncora fundamental, GARCH, OFI, Kyle lambda, fila de pressão de notícia, agentes sintéticos, correlação ou controles (`PriceAttribution.ts:59-74`, `333-389`).

Fato: o fallback usa ordens preenchidas no intervalo como proxy (`route.ts:510-545`, `590-591`), mas o motor declara que order-flow causal vem do snapshot pré-preço, não do preenchimento posterior (`PriceAttribution.ts:380-385`; `OrderFlowSnapshotService.ts:61-79`; `MarketEngine.ts:500-504`).

Interpretação: a frase enquadra movimento dirigido pelo motor como lacuna "não auditável por ordem individual". Para candles novos `source='MOTOR'`, a resposta correta deve ser: ou uma atribuição DIRECT do motor, ou uma falha operacional específica de captura/persistência/parser. Não deve haver narrativa genérica.

## 5. Plano de melhoria — garantir o motivo real, nunca genérico

### A. Tornar DIRECT o caminho padrão para candles novos

1. Medir o baseline real com banco de staging/prod antes de mudar flags: cobertura por `source`, `evidenceGrade`, `qualityFlags`, `degradedOwner`, `parseEngineAttribution.reason` e percentual de movimentos que contêm a frase de `buildMarketFlowExplanation` (`blacksmith/value-analysis-causal-baseline.md:11-22`, `41-51`).
2. Ativar `ATTRIBUTION_STRICT_MODE=true` primeiro em staging. Observação de performance: o parser já roda mesmo sem strict (`MarketEngine.ts:614-616`); o custo principal do strict é operacional, pois preflight ruim bloqueia start (`MarketEngine.ts:87-94`) e coluna indisponível passa a falhar em vez de degradar (`MarketEngine.ts:657-660`).
3. Alertar em `motor_price_attribution_missing_total > 0` e adicionar métrica/contador por motivo: parse inválido, coluna ausente, create sem attribution, readback canary falhou.
4. Transformar o preflight em gate obrigatório de deploy: colunas, schema sync, métricas, parser canary e canary transacional (`AttributionPreflightService.ts:83-100`, `103-240`; `blacksmith/value-analysis-causal-rollout.md:5-17`, `29-44`).

### B. Fazer backfill honesto e completo

5. Corrigir `scripts/backfill-price-attribution.ts` para iterar todos os candidatos em lotes, com checkpoint, dry-run real, limite de taxa e relatório final por `source`. O script atual atualiza só 10 linhas por execução.
6. Para `source='GBM'`, gravar atribuição sintética explícita com `qualityFlags: ['SYNTHETIC_HISTORY', 'LEGACY_BACKFILL']`, sem fingir causa de mercado.
7. Para legado sem `source`, decidir política antes do write: se não houver evidência de motor, marcar `LEGACY_BACKFILL` com causa "histórico legado sem rastro causal"; se houver evidência externa confiável, marcar como correlacionada, não DIRECT.
8. Não sobrescrever atribuição existente sem `--force`; em produção, manter `--force` proibido ou exigir janela/backup.

### C. Eliminar o fallback enganoso

9. Reconhecer `source='MOTOR'` em `sourceQualityFlag`: se `MOTOR` sem atribuição aceita, marcar owner `ENGINE` ou `PERSISTENCE`, com reason específico, nunca `UNKNOWN`.
10. Remover a frase genérica de `buildMarketFlowExplanation` para `source='MOTOR'`. Se não houver atribuição, a mensagem deve dizer "falha de rastro causal do motor" e listar `parseReason`, `source`, presença da coluna e flags; não inferir causa real.
11. Alinhar order-flow do fallback ao motor: usar `inputSnapshot.orderFlowSnapshot` quando disponível; se precisar reconstruir, buscar ordens `OPEN`/`PARTIAL` no início do candle com a mesma semântica de `OrderFlowSnapshotService`, não apenas `FILLED`/`PARTIAL` executadas.
12. Manter o fallback por ordens preenchidas apenas como evidência complementar pós-preço, rotulada como correlacional.

### D. Preservar causalidade em candles agregados

13. No `mergePriceAttributions`, além da contribuição líquida, preservar top contribuições por `grossAbsDelta` e por direção final do candle. Se a primária líquida e a primária bruta divergirem, mostrar "multi-causa" em vez de eleger uma causa única.
14. Persistir `tickCount`, top-2/top-3 causas e eventos dominantes por tick no V2 agregado. O payload já tem limite de 64 KiB e truncamento (`PriceAttribution.ts:38-40`, `392-411`, `599-602`), então a melhoria deve respeitar orçamento de bytes.
15. Avaliar persistência tick-level separada só depois de medir custo. Para a aba, um resumo agregado bem estruturado pode ser suficiente; drill-down tick-level é produto/observabilidade, não pré-requisito para matar a frase genérica.

### E. Melhorar processos a montante

16. Notícias: garantir `newsId` em `activeNewsImpacts`; sem `newsId`, o motor marca `NEWS_WITHOUT_ID` (`MarketEngine.ts:854-889`). `NewsInjectionService` já retorna/propaga `newsId`; o gate deve impedir caminhos legados sem id.
17. Ações administrativas de preço: hoje `ADJUST_PRICE` atualiza preço e registra audit log com `previousPrice`/`newPrice` (`AdminMarketActions.ts:91-112`, `AuditLogger.ts:20-34`), mas isso entra na aba como fallback/correlação quando não há engine attribution (`value-analysis.ts:562-580`, `386-399`). Se ajuste admin deve ser causa DIRECT, criar atribuição V2 `ADMIN_ACTION` ou candle auditável próprio no momento da ação.
18. Snapshot de ordens: manter `ORDER_FLOW_SNAPSHOT_ENABLED=true` após gate de performance; se desligado, o motor grava `ORDER_FLOW_SNAPSHOT_UNAVAILABLE` (`OrderFlowSnapshotService.ts:47-54`), reduzindo a capacidade de explicar OFI/Kyle com evidência direta.
19. Segurança/PII: manter e testar a sanitização de metadata (`PriceAttribution.ts:57`, `125-137`) e o contrato do rollout: sem email, nome, saldo, IP, session id, CPF, telefone ou payload bruto; apenas ids técnicos de ordens, limitados a 10 por candle (`blacksmith/value-analysis-causal-rollout.md:18-22`).
20. Contrato motor/Next: manter `QUALITY_FLAGS`, formato V2 e comentários de `source` sincronizados. Hoje as listas de flags estão alinhadas (`value-analysis.ts:11-36`, `PriceAttribution.ts:42-54`), mas não há garantia forte contra drift futuro além de testes/preflight.

## 6. Critério de pronto

- `attributionCoveragePct` por `source` medido e publicado; meta para candles novos `source='MOTOR'` >= 99%.
- Zero ocorrências da frase `não encontrei ordens preenchidas no intervalo exato do candle` em candles novos `source='MOTOR'`.
- Todo candle `MOTOR` degradado tem `degradedOwner` específico (`ENGINE`, `PERSISTENCE`, `MIGRATION` ou equivalente), `parseReason` e `qualityFlags`; nunca `UNKNOWN`.
- Backfill completo reporta total elegível, total escrito, total pulado e distribuição por `source`.
- Rollout aprovado com p50/p95/p99 de `motor_tick_duration_ms`, `order_flow_snapshot_duration_ms`, `price_attribution_payload_bytes` e validação de PII.

## 7. Hipóteses e pontos em aberto

- hipótese: a frequência real do sintoma é dominada por candles `MOTOR`/legado com `attribution=null` ou parse inválido. Precisa de query real em staging/prod; este diagnóstico não acessou banco.
- hipótese: R6 afeta qualidade percebida em candles agregados, mas sua frequência depende de amostra real de `tickCount > 1` e comparação entre contribuições líquidas/brutas.
- Ponto em aberto: definir se ações administrativas devem virar candle/atribuição DIRECT no motor ou permanecer evidência externa correlacionada na aba.
- Ponto em aberto: decidir política para legados sem `source`: não há evidência de código suficiente para reconstruir causa real; o backfill deve ser honesto e degradado.
- Ponto em aberto: `AttributionPreflightService` compara schemas Prisma removendo comentários; isso não pega drift documental como o comentário stale de `source` no schema Next.

## Fontes e evidências (arquivos do repositório)

- `footstock-next/src/lib/admin/value-analysis.ts` — fallback, parser e classificação de evidência.
- `footstock-next/src/app/api/v1/admin/value-analysis/route.ts` — seleção DIRECT vs fallback, janelas e `motorContext`.
- `motor/src/engine/PriceAttribution.ts` — geração V2, merge, payload, sanitização e elegibilidade de order-flow.
- `motor/src/engine/MarketEngine.ts` — geração/persistência de attribution, strict mode, `source='MOTOR'`, snapshot e ordem do match.
- `motor/src/engine/OrderFlowSnapshotService.ts` — snapshot pré-preço de ordens `OPEN`/`PARTIAL`.
- `motor/src/engine/AttributionPreflightService.ts` — preflight, schema sync, parser canary e canary transacional.
- `blacksmith/value-analysis-causal-baseline.md` / `blacksmith/value-analysis-causal-rollout.md` — contrato de medição, segurança e gate.
- Evidência adicional lida por necessidade: schemas Prisma, migrations M053/M056, seed/backfill GBM, `AdminMarketActions` e `AuditLogger`.
